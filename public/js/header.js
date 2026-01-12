(() => {
	"use strict";

	// -------------------------
	// Active nav item
	// -------------------------
	const path = (window.location.pathname || "/").replace(/\/$/, "") || "/";
	const links = document.querySelectorAll("#Header .menu-item a");

	for (const link of links) {
		const href = (link.getAttribute("href") || "").replace(/\/$/, "") || "/";
		if (href === path) {
			link.classList.add("is-active");
			link.setAttribute("aria-current", "page");
		}
	}

	// -------------------------
	// Mobile menu toggle
	// -------------------------
	const toggleBtn = document.getElementById("menu-toggle-button");
	const menu = document.getElementById("main-menu");

	if (!toggleBtn || !menu) return;

	const setOpen = (open) => {
		menu.classList.toggle("show-menu", open);
		toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
	};

	const isOpen = () => menu.classList.contains("show-menu");

	toggleBtn.addEventListener("click", () => setOpen(!isOpen()));

	document.addEventListener("click", (e) => {
		if (!isOpen()) return;
		if (toggleBtn.contains(e.target) || menu.contains(e.target)) return;
		setOpen(false);
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && isOpen()) setOpen(false);
	});

	const mq = window.matchMedia("(min-width: 1069px)");
	const onChange = () => {
		if (mq.matches) setOpen(false);
	};

	mq.addEventListener?.("change", onChange) ?? mq.addListener(onChange);
})();
