document.addEventListener("DOMContentLoaded", () => {
	const typeRadios = document.querySelectorAll('input[name="type"]');
	const attributesContainer = document.getElementById("attributes-container");
	const scriptEl = document.currentScript || document.querySelector('script[src^="/js/request-credentials.js"]');
	const dcqlQuery = JSON.parse(scriptEl.dataset.dcqlQuery);

	const form = document.querySelector("form");
	const dcqlQueryInput = document.getElementById("dcql-query-input");
	const typeToFormat = new Map(Array.from(typeRadios).map((radio) => [radio.value, radio.dataset.format]));

	function getCredentialByType(type) {
		const format = typeToFormat.get(type);
		if (!format) return null;
		return dcqlQuery.credentials.find((cred) => cred.format === format);
	}

	function getSelectedType() {
		const selectedTypeRadio = document.querySelector('input[name="type"]:checked');
		return selectedTypeRadio ? selectedTypeRadio.value : null;
	}

	function renderFields(type) {
		attributesContainer.replaceChildren();
		const credential = getCredentialByType(type);
		if (!credential) return;

		(credential.claims || []).forEach((claim, idx) => {
			const label = claim.path.join(".");
			const value = claim.path.join(".");
			const fieldWrapper = document.createElement("div");
			fieldWrapper.classList.add("checkbox-wrapper");

			const input = document.createElement("input");
			input.type = "checkbox";
			input.name = "attributes[]";
			input.value = value;
			input.id = `attr-${idx}`;

			const labelElement = document.createElement("label");
			labelElement.htmlFor = input.id;
			labelElement.textContent = label;
			input.addEventListener("change", updateRequestButtonState);
			fieldWrapper.appendChild(input);
			fieldWrapper.appendChild(labelElement);
			attributesContainer.appendChild(fieldWrapper);
		});
		updateRequestButtonState();
	}

	function updateRequestButtonState() {
		const submitButton = document.querySelector(".request-qr");
		const attributeCheckboxes = attributesContainer.querySelectorAll('input[type="checkbox"]');
		const anySelected = Array.from(attributeCheckboxes).some(cb => cb.checked);
		submitButton.disabled = !anySelected;
	}

	typeRadios.forEach((radio) => {
		radio.addEventListener("change", (e) => {
			renderFields(e.target.value);
		});
	});

	document.querySelector("#select-all").addEventListener("click", () => {
		document.querySelectorAll("#attributes-container input[type=checkbox]:not(:disabled)").forEach(checkbox => {
			checkbox.checked = true;
		});
		updateRequestButtonState();
	});

	document.querySelector("#select-none").addEventListener("click", () => {
		document.querySelectorAll("#attributes-container input[type=checkbox]:not(:disabled)").forEach(checkbox => {
			checkbox.checked = false;
		});
		updateRequestButtonState();
	});

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const selectedType = getSelectedType();
		if (!selectedType) return;

		const credential = getCredentialByType(selectedType);
		if (!credential) return;

		const selectedClaims = Array.from(attributesContainer.querySelectorAll('input[type="checkbox"]:checked'))
			.map(cb => cb.value);

		const filteredClaims = (credential.claims || []).filter(claim =>
			selectedClaims.includes(claim.path.join("."))
		);

		const filteredCredential = { ...credential, claims: filteredClaims };
		const filteredDcqlQuery = { ...dcqlQuery, credentials: [filteredCredential] };
		dcqlQueryInput.value = JSON.stringify(filteredDcqlQuery);
		form.submit();
	});

	const initialType = getSelectedType();
	if (initialType) {
		renderFields(initialType);
		return;
	}

	const firstTypeRadio = typeRadios[0];
	if (firstTypeRadio) {
		firstTypeRadio.checked = true;
		renderFields(firstTypeRadio.value);
	} else {
		updateRequestButtonState();
	}
});
