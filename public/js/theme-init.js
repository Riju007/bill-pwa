(() => {
    const savedTheme = localStorage.getItem("billwise-theme");
    if (savedTheme === "dark" || (savedTheme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.dataset.theme = "dark";
    }
})();
