import { sessionReady } from "/js/auth.js";

const pages = ["dashboard", "billing", "bills", "customers", "products"];
const pageContent = document.querySelector("#page-content");

async function loadWorkspace() {
    if (!pageContent) {
        throw new Error("The workspace layout is missing its page container.");
    }

    const templates = await Promise.all(pages.map(async (page) => {
        const response = await fetch(`/pages/${page}.html`);
        if (!response.ok) {
            throw new Error(`Could not load the ${page} page (${response.status}).`);
        }
        return response.text();
    }));

    pageContent.innerHTML = templates.join("\n");
    await import("/js/app.js");
}

function loadWorkspaceOnce() {
    if (pageContent.dataset.loaded) return;
    pageContent.dataset.loaded = "true";
    loadWorkspace().catch(showWorkspaceError);
}

async function startWorkspace() {
    await sessionReady;
    if (!document.querySelector(".app").hidden) loadWorkspaceOnce();
}

document.addEventListener("authenticated", loadWorkspaceOnce);

function showWorkspaceError(error) {
    console.error("Could not load the billing workspace.", error);
    if (!pageContent) return;

    const message = document.createElement("p");
    message.className = "empty-state";
    message.setAttribute("role", "alert");
    message.textContent = "The workspace could not be loaded. Refresh the page to try again.";
    pageContent.replaceChildren(message);
}

startWorkspace().catch(showWorkspaceError);
