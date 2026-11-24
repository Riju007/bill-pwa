const loginScreen = document.querySelector("#login-screen");
const app = document.querySelector(".app");
const mobileNav = document.querySelector(".mobile-nav");
const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");

function showLogin(error = "") {
    app.hidden = true;
    mobileNav.hidden = true;
    loginScreen.hidden = false;
    message.textContent = error;
    document.querySelector("#login-username").focus();
}

function showWorkspace() {
    loginScreen.hidden = true;
    app.hidden = false;
    mobileNav.hidden = false;
}

export const sessionReady = (async () => {
    try {
        const response = await fetch("/api/auth/session");
        const result = await response.json();
        if (result.authenticated) {
            showWorkspace();
            return;
        }
        showLogin(result.error || "");
    } catch {
        showLogin("Unable to check the login session. Please try again.");
    }
})();

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: new FormData(form).get("username"),
                password: new FormData(form).get("password"),
            }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to log in.");
        showWorkspace();
        document.dispatchEvent(new Event("authenticated"));
    } catch (error) {
        message.textContent = error.message;
    } finally {
        submit.disabled = false;
    }
});
