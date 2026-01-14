(function () {
	const path = window.location.pathname;
	const segments = path.split("/").filter(Boolean);
	const presentationRequestId = segments[segments.length - 1];
	if (!presentationRequestId) return;

	setInterval(() => {
		fetch(
			"/verifier/public/definitions/presentation-request/status/" +
			encodeURIComponent(presentationRequestId),
			{ method: "GET" }
		)
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP error with status ${response.status}`);
				return response.json();
			})
			.then((data) => {
				const url = data?.url;
				if (url) window.location.href = url;
			})
			.catch((err) => console.error(err));
	}, 3000);
})();
