document.addEventListener("DOMContentLoaded", () => {
	const typeRadios = document.querySelectorAll('input[name="type"]');
	const attributesContainer = document.getElementById("attributes-container");
	const scriptEl = document.currentScript || document.querySelector('script[src^="/js/request-credentials.js"]');
	const dcqlQuery = JSON.parse(scriptEl.dataset.dcqlQuery);
	const selectAllLabel = scriptEl.dataset.selectAllLabel || "Select all";

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

		const masterWrapper = document.createElement("div");
		masterWrapper.classList.add("checkbox-wrapper", "checkbox-wrapper--master");

		const masterCheckbox = document.createElement("input");
		masterCheckbox.type = "checkbox";
		masterCheckbox.id = "select-all-attributes";

		const masterLabel = document.createElement("label");
		masterLabel.htmlFor = masterCheckbox.id;
		masterLabel.textContent = selectAllLabel;

		masterCheckbox.addEventListener("change", () => {
			const attributeCheckboxes = getAttributeCheckboxes();
			attributeCheckboxes.forEach((checkbox) => {
				checkbox.checked = masterCheckbox.checked;
			});
			updateSelectionState();
		});

		masterWrapper.appendChild(masterCheckbox);
		masterWrapper.appendChild(masterLabel);
		attributesContainer.appendChild(masterWrapper);

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
			input.addEventListener("change", updateSelectionState);
			fieldWrapper.appendChild(input);
			fieldWrapper.appendChild(labelElement);
			attributesContainer.appendChild(fieldWrapper);
		});
		updateSelectionState();
	}

	function getAttributeCheckboxes() {
		return attributesContainer.querySelectorAll('input[name="attributes[]"]');
	}

	function updateSelectionState() {
		const masterCheckbox = attributesContainer.querySelector('#select-all-attributes');
		const attributeCheckboxes = getAttributeCheckboxes();
		const submitButton = document.querySelector(".request-qr");
		const checkedCount = Array.from(attributeCheckboxes).filter((checkbox) => checkbox.checked).length;
		const anySelected = checkedCount > 0;
		const allSelected = attributeCheckboxes.length > 0 && checkedCount === attributeCheckboxes.length;

		if (masterCheckbox) {
			masterCheckbox.disabled = attributeCheckboxes.length === 0;
			masterCheckbox.checked = allSelected;
			masterCheckbox.indeterminate = !allSelected && anySelected;
			masterCheckbox.setAttribute("aria-checked", masterCheckbox.indeterminate ? "mixed" : String(masterCheckbox.checked));
		}

		submitButton.disabled = !anySelected;
	}

	typeRadios.forEach((radio) => {
		radio.addEventListener("change", (e) => {
			renderFields(e.target.value);
		});
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
		updateSelectionState();
	}
});
