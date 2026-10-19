import { h } from './dom.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Diálogo de login por e-mail: 1) pede o e-mail e envia um código; 2) recebe o código de 6 dígitos.
 * (O e-mail também traz um link que faz o mesmo; os dois caminhos funcionam.)
 * @param {{requestCode: (email: string) => Promise<void>, verifyCode: (email: string, token: string) => Promise<void>}} api
 */
export function openLoginDialog(api) {
  const dlg = h('dialog');
  const message = h('div', { class: 'muted', style: 'min-height:1.4em;margin:8px 0' });
  const emailInput = h('input', { type: 'text', placeholder: 'seu@email.com', autocomplete: 'email', inputmode: 'email' });
  const codeInput = h('input', { type: 'text', placeholder: 'Código do e-mail', autocomplete: 'one-time-code', inputmode: 'numeric', maxlength: 10 });
  const sendBtn = h('button', { class: 'primary' }, 'Enviar código');
  const verifyBtn = h('button', { class: 'primary' }, 'Entrar');
  const closeBtn = h('button', { onclick: () => { dlg.close(); dlg.remove(); } }, 'Fechar');
  let email = '';

  function setBusy(busy) { for (const b of [sendBtn, verifyBtn]) b.disabled = busy; }
  function fail(e) { message.className = 'issue-error'; message.textContent = e.message; setBusy(false); }

  function showCodeStep() {
    dlg.replaceChildren(
      h('h2', {}, 'Digite o código'),
      h('p', {}, `Enviamos um e-mail para ${email}. Digite o código que veio nele, ou clique no link do e-mail.`),
      codeInput, message,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, closeBtn, verifyBtn));
    message.className = 'muted';
    message.textContent = '';
    codeInput.focus();
  }

  sendBtn.addEventListener('click', async () => {
    email = emailInput.value.trim();
    if (!EMAIL_PATTERN.test(email)) { fail(new Error('Digite um e-mail válido.')); return; }
    setBusy(true);
    try {
      await api.requestCode(email);
      setBusy(false);
      showCodeStep();
    } catch (e) { fail(e); }
  });

  verifyBtn.addEventListener('click', async () => {
    const token = codeInput.value.replace(/\s/g, '');
    if (!token) { fail(new Error('Digite o código recebido por e-mail.')); return; }
    setBusy(true);
    try {
      await api.verifyCode(email, token);
      dlg.close();
      dlg.remove();
    } catch (e) { fail(new Error('Código inválido ou expirado. Peça um novo código.')); }
  });

  emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyBtn.click(); });

  dlg.append(
    h('h2', {}, 'Entrar para sincronizar'),
    h('p', { class: 'muted' }, 'Sem login, seus simulados ficam só neste aparelho. Com login, eles aparecem em qualquer navegador ou aparelho. Você recebe um código por e-mail, sem senha.'),
    emailInput, message,
    h('div', { class: 'row', style: 'justify-content:flex-end' }, closeBtn, sendBtn));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  emailInput.focus();
}
