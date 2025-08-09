// This script acts as the main controller on the page.
// It ensures that the logic is only loaded once.
if (typeof window.privacyBlurManager === "undefined") {
	window.privacyBlurManager = (function () {
		let isSessionActive = false;
		let isDrawing = false;
		let drawMode = "rect";
		let startX, startY;
		let currentDrawingElement = null;
		let customPathPoints = [];
		let blurIntensity = 16;
		let isEnabled = true;

		// --- CORE FUNCTIONS (No changes here) ---
		function startBlurSession() {
			if (document.getElementById("privacy-blur-config-overlay")) return;
			isSessionActive = true;
			createConfigUI();
			showVisualIndicator();
		}
		function createConfigUI() {
			const cssLink = document.createElement("link");
			cssLink.href = chrome.runtime.getURL("content/content.css");
			cssLink.type = "text/css";
			cssLink.rel = "stylesheet";
			document.head.appendChild(cssLink);
			const overlay = document.createElement("div");
			overlay.id = "privacy-blur-config-overlay";
			document.body.appendChild(overlay);
			const toolbar = document.createElement("div");
			toolbar.id = "privacy-blur-toolbar";
			toolbar.innerHTML = `
                <div class="tool-group">
                    <button id="tool-add" title="Add Blur Shape"><i class="fa-solid fa-plus"></i> Add</button>
                    <button id="tool-rect" title="Rectangle"><i class="fa-regular fa-square"></i></button>
                    <button id="tool-circle" title="Circle"><i class="fa-regular fa-circle"></i></button>
                    <button id="tool-draw" title="Custom Shape"><i class="fa-solid fa-pen-fancy"></i></button>
                </div><div class="separator"></div><div class="tool-group"><button id="tool-eraser" title="Eraser"><i class="fa-solid fa-eraser"></i> Eraser</button></div>
                <div class="separator"></div><button id="tool-finish" class="finish-btn"><i class="fa-solid fa-check"></i> Finish</button>`;
			const faLink = document.createElement("link");
			faLink.rel = "stylesheet";
			faLink.href =
				"https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
			document.head.appendChild(faLink);
			document.body.appendChild(toolbar);
			addToolbarListeners();
			addOverlayListeners(overlay);
		}
		function destroyConfigUI() {
			isSessionActive = false;
			document
				.querySelectorAll(".privacy-blur-overlay-container")
				.forEach((el) => {
					el.style.pointerEvents = "none";
				});
			document.getElementById("privacy-blur-config-overlay")?.remove();
			document.getElementById("privacy-blur-toolbar")?.remove();
		}
		function addToolbarListeners() {
			const addBtn = document.getElementById("tool-add"),
				rectBtn = document.getElementById("tool-rect"),
				circleBtn = document.getElementById("tool-circle"),
				drawBtn = document.getElementById("tool-draw"),
				eraserBtn = document.getElementById("tool-eraser"),
				finishBtn = document.getElementById("tool-finish");
			const setActiveTool = (tool) => {
				drawMode = tool;
				const isDrawingTool = ["rect", "circle", "custom"].includes(
					tool
				);
				addBtn.classList.toggle("active", isDrawingTool);
				rectBtn.classList.toggle("active", tool === "rect");
				circleBtn.classList.toggle("active", tool === "circle");
				drawBtn.classList.toggle("active", tool === "custom");
				eraserBtn.classList.toggle("active", tool === "eraser");
				if (tool === "eraser") setInteractionState("drag/erase");
				else setInteractionState("draw");
			};
			addBtn.onclick = () => setActiveTool("rect");
			rectBtn.onclick = () => setActiveTool("rect");
			circleBtn.onclick = () => setActiveTool("circle");
			drawBtn.onclick = () => setActiveTool("custom");
			eraserBtn.onclick = () => setActiveTool("eraser");
			finishBtn.onclick = () => {
				destroyConfigUI();
				saveAllBlurs();
			};
			setActiveTool("rect");
		}
		function setInteractionState(state) {
			const configOverlay = document.getElementById(
				"privacy-blur-config-overlay"
			);
			const blurElements = document.querySelectorAll(
				".privacy-blur-overlay-container"
			);
			if (state === "draw") {
				configOverlay.style.pointerEvents = "auto";
				configOverlay.style.cursor = "crosshair";
				blurElements.forEach((el) => (el.style.pointerEvents = "none"));
			} else {
				configOverlay.style.pointerEvents = "none";
				blurElements.forEach((el) => {
					el.style.pointerEvents = "auto";
					el.style.cursor = drawMode === "eraser" ? "cell" : "move";
				});
			}
		}

		// --- EVENT LISTENERS (REWRITTEN LOGIC FOR CUSTOM SHAPE) ---
		function addOverlayListeners(overlay) {
			overlay.onmousedown = (e) => {
				if (e.button !== 0 || drawMode === "eraser") return;
				isDrawing = true;
				startX = e.pageX;
				startY = e.pageY;

				const blurData = {
					id: `blur_${Date.now()}`,
					type: drawMode,
					x: startX,
					y: startY,
					width: 0,
					height: 0,
					path: "",
				};
				if (drawMode === "custom")
					customPathPoints = [{ x: startX, y: startY }];

				currentDrawingElement = createBlurElement(blurData);
				document.body.appendChild(currentDrawingElement);
			};

			overlay.onmousemove = (e) => {
				if (!isDrawing) return;
				const currentX = e.pageX;
				const currentY = e.pageY;

				if (drawMode === "rect" || drawMode === "circle") {
					const width = Math.abs(currentX - startX);
					const height = Math.abs(currentY - startY);
					const left = Math.min(currentX, startX);
					const top = Math.min(currentY, startY);
					currentDrawingElement.style.left = `${left}px`;
					currentDrawingElement.style.top = `${top}px`;
					currentDrawingElement.style.width = `${width}px`;
					currentDrawingElement.style.height = `${height}px`;
				} else if (drawMode === "custom") {
					customPathPoints.push({ x: currentX, y: currentY });

					// Find the bounding box of the path
					const minX = Math.min(...customPathPoints.map((p) => p.x));
					const minY = Math.min(...customPathPoints.map((p) => p.y));
					const maxX = Math.max(...customPathPoints.map((p) => p.x));
					const maxY = Math.max(...customPathPoints.map((p) => p.y));

					// Position the container div at the bounding box's top-left
					currentDrawingElement.style.left = `${minX}px`;
					currentDrawingElement.style.top = `${minY}px`;
					currentDrawingElement.style.width = `${maxX - minX}px`;
					currentDrawingElement.style.height = `${maxY - minY}px`;

					// Make the SVG path coordinates relative to the container's top-left
					const pathData = customPathPoints
						.map(
							(p, i) =>
								`${i === 0 ? "M" : "L"} ${p.x - minX} ${
									p.y - minY
								}`
						)
						.join(" ");

					// Store the raw path data on the element itself for saving later
					currentDrawingElement.dataset.pathData = pathData;

					// Apply the clip-path
					applyClipPath(currentDrawingElement, pathData);
				}
			};
			overlay.onmouseup = () => {
				if (!isDrawing) return;
				isDrawing = false;
				currentDrawingElement = null;
				customPathPoints = [];
				setInteractionState("drag/erase");
			};
		}

		// --- DYNAMIC SVG AND CLIP-PATH MANAGEMENT (NEW AND REVISED) ---
		function getSvgDefsContainer() {
			let svg = document.getElementById("priblur-svg-defs");
			if (!svg) {
				svg = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"svg"
				);
				svg.id = "priblur-svg-defs";
				svg.style.position = "absolute";
				svg.style.width = "0";
				svg.style.height = "0";
				document.body.appendChild(svg);
			}
			return svg;
		}

		function applyClipPath(element, pathData) {
			const svg = getSvgDefsContainer();
			const clipPathId = `clip_${element.id}`;

			let clipPath = document.getElementById(clipPathId);
			if (!clipPath) {
				clipPath = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"clipPath"
				);
				clipPath.id = clipPathId;
				const path = document.createElementNS(
					"http://www.w3.org/2000/svg",
					"path"
				);
				clipPath.appendChild(path);
				svg.appendChild(clipPath);
			}

			clipPath.firstElementChild.setAttribute("d", pathData);
			element.style.clipPath = `url(#${clipPathId})`;
		}

		// --- BLUR ELEMENT MANAGEMENT (REVISED) ---
		function makeElementInteractive(el) {
			el.addEventListener("click", () => {
				if (isSessionActive && drawMode === "eraser") {
					el.remove();
					saveAllBlurs();
				}
			});
			el.addEventListener("mousedown", (e) => {
				if (!isSessionActive || drawMode === "eraser" || e.button !== 0)
					return;
				el.classList.add("dragging");
				const offsetX = e.pageX - el.offsetLeft;
				const offsetY = e.pageY - el.offsetTop;
				function onMouseMove(e) {
					el.style.left = `${e.pageX - offsetX}px`;
					el.style.top = `${e.pageY - offsetY}px`;
				}
				function onMouseUp() {
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
					el.classList.remove("dragging");
					saveAllBlurs();
				}
				document.addEventListener("mousemove", onMouseMove);
				document.addEventListener("mouseup", onMouseUp);
			});
		}

		function createBlurElement(blurData) {
			const el = document.createElement("div");
			el.className = "privacy-blur-overlay-container";
			el.id = blurData.id;
			el.style.left = `${blurData.x}px`;
			el.style.top = `${blurData.y}px`;
			el.style.width = `${blurData.width}px`;
			el.style.height = `${blurData.height}px`;
			el.style.backdropFilter = `blur(${blurIntensity}px)`;
			el.dataset.type = blurData.type;

			if (blurData.type === "circle") el.style.borderRadius = "50%";

			// On load, if it's a custom shape, we must recreate its clip-path
			if (blurData.type === "custom" && blurData.path) {
				el.dataset.pathData = blurData.path; // Restore the path data
				applyClipPath(el, blurData.path);
			}

			makeElementInteractive(el);
			if (isSessionActive) {
				el.style.pointerEvents = "auto";
				el.style.cursor = "move";
			}
			return el;
		}

		// --- SAVING AND LOADING (REVISED) ---
		function saveAllBlurs() {
			const blurs = [];
			document
				.querySelectorAll(".privacy-blur-overlay-container")
				.forEach((el) => {
					blurs.push({
						id: el.id,
						type: el.dataset.type,
						x: el.offsetLeft,
						y: el.offsetTop,
						width: el.offsetWidth,
						height: el.offsetHeight,
						// IMPORTANT: Save the raw path data, not the URL!
						path: el.dataset.pathData || "",
					});
				});
			chrome.runtime.sendMessage({
				type: "SAVE_BLURS",
				payload: { blurs },
			});
		}

		function applyAllBlurs(blurs) {
			clearAllBlurs(false);
			if (blurs && blurs.length > 0) {
				// Ensure SVG container exists before applying blurs that might need it
				getSvgDefsContainer();
				for (const blurData of blurs) {
					const el = createBlurElement(blurData);
					document.body.appendChild(el);
				}
				showVisualIndicator();
			}
		}

		function clearAllBlurs(shouldSave = true) {
			document
				.querySelectorAll(".privacy-blur-overlay-container")
				.forEach((e) => e.remove());
			document.getElementById("privacy-blur-indicator")?.remove();
			// Don't remove the SVG defs container, it might be needed again
			if (shouldSave)
				chrome.runtime.sendMessage({
					type: "SAVE_BLURS",
					payload: { blurs: [] },
				});
		}

		// --- Other functions (No changes here) ---
		function showVisualIndicator() {
			if (document.getElementById("privacy-blur-indicator")) return;
			const indicator = document.createElement("div");
			indicator.id = "privacy-blur-indicator";
			indicator.innerHTML = `<i class="fa-solid fa-eye-slash"></i> Blurring Active`;
			document.body.appendChild(indicator);
		}
		function updateBlurIntensity(newIntensity) {
			blurIntensity = newIntensity;
			document
				.querySelectorAll(".privacy-blur-overlay-container")
				.forEach((el) => {
					el.style.backdropFilter = `blur(${blurIntensity}px)`;
				});
		}
		chrome.runtime.onMessage.addListener(
			(request, sender, sendResponse) => {
				if (!isEnabled && request.type !== "SET_ENABLED") return true;
				switch (request.type) {
					case "START_SESSION":
						startBlurSession();
						break;
					case "APPLY_BLURS":
						applyAllBlurs(request.payload.blurs);
						break;
					case "CLEAR_ALL_BLURS":
						clearAllBlurs();
						break;
					case "UPDATE_INTENSITY":
						updateBlurIntensity(request.payload.intensity);
						break;
					case "SET_ENABLED":
						isEnabled = request.payload.isEnabled;
						if (!isEnabled) clearAllBlurs(false);
						break;
				}
				sendResponse({ success: true });
				return true;
			}
		);
		(async () => {
			const settings = await chrome.storage.sync.get([
				"isEnabled",
				"blurIntensity",
			]);
			isEnabled = settings.isEnabled !== false;
			blurIntensity = settings.blurIntensity || 16;
			if (isEnabled) {
				try {
					const response = await chrome.runtime.sendMessage({
						type: "GET_BLURS",
					});
					const blurs = response ? response.blurs : [];
					if (blurs && blurs.length > 0) {
						applyAllBlurs(blurs);
					}
				} catch (e) {
					console.warn(
						"PriBlur: Could not communicate with the background script on initial load."
					);
				}
			}
		})();
	})();
}
