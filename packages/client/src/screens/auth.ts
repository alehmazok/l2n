import { PASSWORD_MIN } from "@l2n/shared";
import { api, ApiError } from "../api.js";
import { $, esc } from "../ui.js";

export function renderAuth(root: HTMLElement, onDone: () => void) {
  let mode: "login" | "signup" = "login";

  const draw = (error = "") => {
    root.innerHTML = `
      <section class="panel">
        <div class="tabs">
          <button type="button" class="tab ${mode === "login" ? "active" : ""}" data-mode="login">Log in</button>
          <button type="button" class="tab ${mode === "signup" ? "active" : ""}" data-mode="signup">Create account</button>
        </div>
        <form id="auth" class="stack">
          <label>Email <input name="email" type="email" autocomplete="email" required /></label>
          <label>Password
            <input name="password" type="password" minlength="${PASSWORD_MIN}" required
              autocomplete="${mode === "login" ? "current-password" : "new-password"}" />
          </label>
          ${mode === "signup" ? `<p class="muted small">At least ${PASSWORD_MIN} characters.</p>` : ""}
          <p class="bad" role="alert">${esc(error)}</p>
          <button type="submit">${mode === "login" ? "Enter the world" : "Create account"}</button>
        </form>
      </section>`;
    root.querySelectorAll<HTMLButtonElement>(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        mode = b.dataset.mode as typeof mode;
        draw();
      }),
    );
    const form = $<HTMLFormElement>("#auth", root);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const email = String(data.get("email"));
      const password = String(data.get("password"));
      $<HTMLButtonElement>("button[type=submit]", form).disabled = true;
      try {
        await (mode === "login" ? api.login(email, password) : api.signup(email, password));
        onDone();
      } catch (err) {
        draw(err instanceof ApiError ? err.message : String(err));
        $<HTMLInputElement>("input[name=email]", root).value = email;
      }
    });
  };
  draw();
}
