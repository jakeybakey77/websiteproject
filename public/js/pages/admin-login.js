const form = document.getElementById('login-form');
const status = document.getElementById('login-status');
const submit = document.getElementById('login-submit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  status.textContent = 'Signing in…';
  const data = new FormData(form);
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username: data.get('username'), password: data.get('password') }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Sign-in failed.');
    location.replace('/admin/');
  } catch (error) {
    status.textContent = error.message;
    submit.disabled = false;
    document.getElementById('password').focus();
  }
});
