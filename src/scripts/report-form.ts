/**
 * Состояния формы сообщения об ошибке.
 *
 * Контракт с воркером (`POST /api/contact`):
 *
 *   200 { status: "accepted",  ticket: "GB-…" }
 *   200 { status: "duplicate", act: "…", since: "YYYY-MM-DD", count: n }
 *   400 { status: "invalid",   message: "…" }
 *   429 { status: "rate_limited" }
 *   иное / сеть недоступна → состояние «не отправилось»
 *
 * Текст пользователя при неудаче остаётся в полях: он его уже написал,
 * терять его из-за нашей поломки нельзя.
 *
 * Хранилищ не трогаем — ни localStorage, ни sessionStorage.
 */

import { formatRuDate } from '../lib/date.ts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const MIN_NOTE_LENGTH = 12;

type Panel = 'form' | 'sent' | 'dupe' | 'failed';

interface AcceptedResponse {
  readonly status: 'accepted';
  readonly ticket: string;
}

interface DuplicateResponse {
  readonly status: 'duplicate';
  readonly act?: string;
  readonly since?: string;
  readonly count?: number;
}

interface InvalidResponse {
  readonly status: 'invalid';
  readonly message?: string;
}

type ContactResponse = AcceptedResponse | DuplicateResponse | InvalidResponse | { status: string };

function init(): void {
  const root = document.querySelector<HTMLElement>('[data-report-form]');
  if (root === null) return;

  const form = root.querySelector<HTMLFormElement>('#report-form');
  const email = root.querySelector<HTMLInputElement>('#report-email');
  const note = root.querySelector<HTMLTextAreaElement>('#report-note');
  const submit = root.querySelector<HTMLButtonElement>('[data-report-submit]');
  const invalidBox = root.querySelector<HTMLElement>('[data-report-invalid]');
  const invalidText = root.querySelector<HTMLElement>('[data-report-invalid-text]');
  const panels: Record<Exclude<Panel, 'form'>, HTMLElement | null> = {
    sent: root.querySelector('[data-report-sent]'),
    dupe: root.querySelector('[data-report-dupe]'),
    failed: root.querySelector('[data-report-failed]'),
  };

  if (form === null || email === null || note === null || submit === null) return;

  function show(panel: Panel): void {
    form!.hidden = panel !== 'form';
    for (const [name, node] of Object.entries(panels)) {
      if (node !== null) node.hidden = name !== panel;
    }
  }

  function showInvalid(message: string | null): void {
    if (invalidBox === null || invalidText === null) return;
    invalidBox.hidden = message === null;
    if (message !== null) invalidText.textContent = message;
  }

  /** Проверка на клиенте — вежливость. Настоящая проверка на сервере. */
  function localComplaint(): string | null {
    if (!EMAIL_RE.test(email!.value.trim())) {
      return 'Адрес почты выглядит неполным — без него мы не сможем ответить.';
    }
    if (note!.value.trim().length < MIN_NOTE_LENGTH) {
      return 'Опишите расхождение хотя бы одной фразой: что и где не сходится.';
    }
    return null;
  }

  function setSending(sending: boolean): void {
    submit!.disabled = sending;
    submit!.textContent = sending ? 'Отправляем…' : 'Отправить';
    submit!.style.background = sending ? '#8b9a86' : 'var(--link)';
    submit!.style.cursor = sending ? 'default' : 'pointer';
  }

  function duplicateText(payload: DuplicateResponse): string {
    const act = payload.act === undefined ? null : `Постановление № ${payload.act}`;
    const since = payload.since === undefined ? null : `проверяем с ${formatRuDate(payload.since)}`;
    const count =
      payload.count === undefined || payload.count < 2
        ? null
        : `обращений по нему уже ${payload.count}`;
    const head = [act, since, count].filter((part) => part !== null).join(', ');
    return (
      `${head === '' ? 'Это расхождение уже проверяется' : head}. ` +
      'Пока проверка не закончена, цифра на главной остаётся прежней. ' +
      'Ваше письмо не потеряется — мы добавили вас в этот же запрос.'
    );
  }

  async function send(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();

    const complaint = localComplaint();
    if (complaint !== null) {
      showInvalid(complaint);
      (EMAIL_RE.test(email!.value.trim()) ? note! : email!).focus();
      return;
    }
    showInvalid(null);
    setSending(true);

    try {
      const response = await fetch(form!.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          email: email!.value.trim(),
          note: note!.value.trim(),
          // Ловушка: у человека это поле пустое, бот его заполняет.
          city: root!.querySelector<HTMLInputElement>('#report-city')?.value ?? '',
          turnstile:
            root!.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? '',
        }),
      });

      const payload = (await response.json().catch(() => ({ status: 'unknown' }))) as ContactResponse;

      if (response.ok && payload.status === 'accepted') {
        const ticket = root!.querySelector<HTMLElement>('[data-report-ticket]');
        const shown = root!.querySelector<HTMLElement>('[data-report-email]');
        if (ticket !== null) ticket.textContent = (payload as AcceptedResponse).ticket;
        if (shown !== null) shown.textContent = email!.value.trim();
        show('sent');
        note!.value = '';
        return;
      }

      if (response.ok && payload.status === 'duplicate') {
        const text = root!.querySelector<HTMLElement>('[data-report-dupe-text]');
        if (text !== null) text.textContent = duplicateText(payload as DuplicateResponse);
        show('dupe');
        return;
      }

      if (payload.status === 'invalid') {
        showInvalid(
          (payload as InvalidResponse).message ??
            'Сообщение не приняли. Проверьте почту и текст.',
        );
        return;
      }

      if (response.status === 429) {
        showInvalid('Слишком много сообщений подряд. Попробуйте через несколько минут.');
        return;
      }

      show('failed');
    } catch {
      // Сеть недоступна или воркер не отвечает. Текст остаётся в полях.
      show('failed');
    } finally {
      setSending(false);
    }
  }

  form.addEventListener('submit', (event) => {
    void send(event);
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-report-reset]')) {
    button.addEventListener('click', () => {
      note.value = '';
      showInvalid(null);
      show('form');
      note.focus();
    });
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-report-retry]')) {
    button.addEventListener('click', () => {
      show('form');
      void send();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
