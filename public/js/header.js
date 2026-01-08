(() => {
	"use strict";

	const toggleBtn = document.getElementById("menu-toggle-button");
	const menu = document.getElementById("main-menu");

	// Header might not exist on some pages
	if (!toggleBtn || !menu) return;

	const setOpen = (open) => {
		menu.classList.toggle("show-menu", open);
		toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
	};

	const isOpen = () => menu.classList.contains("show-menu");

	// Toggle on click
	toggleBtn.addEventListener("click", () => setOpen(!isOpen()));

	// Close when clicking outside
	document.addEventListener("click", (e) => {
		if (!isOpen()) return;
		if (toggleBtn.contains(e.target) || menu.contains(e.target)) return;
		setOpen(false);
	});

	// Close on Escape
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && isOpen()) setOpen(false);
	});

	// If screen becomes desktop, ensure the dropdown isn't stuck open
	const mq = window.matchMedia("(min-width: 1069px)");
	const onChange = () => {
		if (mq.matches) setOpen(false);
	};

	mq.addEventListener?.("change", onChange) ?? mq.addListener(onChange);
})();
