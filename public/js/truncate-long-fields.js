document.addEventListener('DOMContentLoaded', () => {
	const MAX_LENGTH = 120;

	const truncateValue = (value) => {
		if (typeof value === 'string' && value.length > MAX_LENGTH) {
			return value.slice(0, MAX_LENGTH) + '...';
		}
		return value;
	};

	document.querySelectorAll('.claim-value').forEach(td => {
		try {
			const inferredType = td.getAttribute('data-inferred-type') || 'text';
			if (inferredType !== 'text') {
				return;
			}

			const raw = td.getAttribute('data-raw-value');
			if (!raw) return;
			const truncated = truncateValue(raw);
			td.textContent = truncated;
		} catch (e) {
			console.error('Truncation error:', e);
		}
	});
});
