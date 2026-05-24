//#region src/background.js
var OFFSCREEN_DOCUMENT_PATH = "offscreen.html";
var creatingOffscreen;
async function setupOffscreenDocument(path) {
	if (await hasDocument()) return;
	if (creatingOffscreen) await creatingOffscreen;
	else try {
		creatingOffscreen = chrome.offscreen.createDocument({
			url: path,
			reasons: ["WORKERS"],
			justification: "Run heavy AI models and Vector DB in background"
		});
		await creatingOffscreen;
		await chrome.runtime.sendMessage({
			target: "offscreen",
			type: "INIT"
		});
		console.log("[CGPTOpt-Bg] Offscreen initialized successfully.");
	} catch (e) {
		if (!e.message.includes("Only a single offscreen document may be created")) {
			console.error("[CGPTOpt-Bg] Error initializing offscreen:", e);
			throw e;
		}
	} finally {
		creatingOffscreen = null;
	}
}
async function hasDocument() {
	if ("getContexts" in chrome.runtime) return (await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
	})).length > 0;
	try {
		return (await clients.matchAll()).some((c) => c.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH));
	} catch {
		return false;
	}
}
chrome.runtime.onInstalled.addListener(() => {
	console.log("ChatGPT Optimizer background script installed.");
	setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
});
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if ([
		"RAG_SEARCH",
		"EMBED_AND_STORE",
		"GET_STATS",
		"CLEAR_MEMORY"
	].includes(request.type)) {
		(async () => {
			try {
				await setupOffscreenDocument(OFFSCREEN_DOCUMENT_PATH);
				const msg = {
					target: "offscreen",
					type: request.type,
					text: request.text
				};
				if (request.id) msg.id = request.id;
				sendResponse(await chrome.runtime.sendMessage(msg));
			} catch (err) {
				sendResponse({
					success: false,
					error: err.message
				});
			}
		})();
		return true;
	}
	if (request.type === "OPTIMIZE_PROMPT_BACKGROUND") {
		(async () => {
			let groqError = null;
			try {
				const CONFIG_KEY = "cgpt_optimizer_config_v1";
				const groqKey = ((await (chrome.storage.sync || chrome.storage.local).get(CONFIG_KEY))[CONFIG_KEY] || {}).groq_key;
				if (groqKey && groqKey.trim().length > 0) {
					const res = await handleGroqOptimization(request.payload.instruction, groqKey);
					if (res.success) {
						sendResponse(res);
						return;
					} else {
						groqError = res.error;
						console.warn("[CGPTOpt-Bg] Groq API failed, falling back to UI automation:", res.error);
					}
				}
				sendResponse({
					success: true,
					optimized: await handleOptimization(request.payload.instruction)
				});
			} catch (error) {
				console.error("[CGPTOpt-Bg] General Error:", error.message);
				sendResponse({
					success: false,
					error: groqError ? `Groq Failed: ${groqError} | UI Failed: ${error.message}` : error.message
				});
			}
		})();
		return true;
	} else if (request.type === "RESET_WORKER") {
		resetWorkerTab().then(() => sendResponse({ success: true }));
		return true;
	} else if (request.type === "CLOSE_CURRENT_TAB") {
		if (sender && sender.tab && sender.tab.id) chrome.tabs.remove(sender.tab.id).catch((e) => console.error(e));
		return true;
	}
});
/**
* Handles the optimization by opening a temporary background tab
*/
var workerWindowId = null;
var workerTabId = null;
var workerBusy = false;
/**
* Ensures the worker tab is open and ready
*/
async function ensureWorkerTab() {
	let win = null;
	if (workerWindowId) try {
		win = await chrome.windows.get(workerWindowId, { populate: true });
		if (win && win.tabs && win.tabs.length > 0) workerTabId = win.tabs[0].id;
		else throw new Error("Window has no tabs");
	} catch (e) {
		workerWindowId = null;
		workerTabId = null;
	}
	if (!win) {
		console.log("[CGPTOpt-Bg] Creating fresh worker window (off-screen)...");
		win = await chrome.windows.create({
			url: "https://chatgpt.com/?temporary-chat=true",
			type: "popup",
			focused: false,
			left: 100,
			top: 100,
			width: 200,
			height: 200
		});
		workerWindowId = win.id;
		workerTabId = win.tabs[0].id;
		await waitForTabComplete(workerTabId);
		await new Promise((r) => setTimeout(r, 1500));
	}
	return win;
}
/**
* Resets the worker tab to a fresh state (new temporary chat)
*/
async function resetWorkerTab() {
	if (!workerWindowId || workerBusy) return;
	console.log("[CGPTOpt-Bg] Resetting worker tab (Context Clear)...");
	try {
		await chrome.tabs.update(workerTabId, { url: "https://chatgpt.com/?temporary-chat=true" });
		await waitForTabComplete(workerTabId);
		await new Promise((r) => setTimeout(r, 800));
	} catch (e) {
		workerWindowId = null;
		await ensureWorkerTab();
	}
}
/**
* Handles the optimization by using a persistent hidden worker window
*/
async function handleOptimization(instruction, attempt = 1) {
	if (workerBusy && attempt === 1) await new Promise((r) => setTimeout(r, 1e3));
	workerBusy = true;
	try {
		const tab = (await ensureWorkerTab()).tabs[0];
		if (!tab.url.includes("temporary-chat=true")) {
			await chrome.tabs.update(tab.id, { url: "https://chatgpt.com/?temporary-chat=true" });
			await waitForTabComplete(tab.id);
			await new Promise((r) => setTimeout(r, 800));
		}
		const tabId = workerTabId;
		let tabInfo = await chrome.tabs.get(tabId);
		if (!tabInfo.url.includes("chatgpt.com") || tabInfo.status === "loading") {
			await chrome.tabs.reload(tabId);
			await waitForTabComplete(tabId);
			await new Promise((r) => setTimeout(r, 1e3));
			tabInfo = await chrome.tabs.get(tabId);
		}
		if (!tabInfo.url.includes("chatgpt.com")) {
			workerWindowId = null;
			throw new Error(`Page redirected or failed to load: ${tabInfo.url}`);
		}
		const result = await chrome.scripting.executeScript({
			target: { tabId },
			func: automateChatGPT,
			args: [instruction]
		});
		if (result && result.length > 0) {
			const scriptResult = result[0].result;
			if (scriptResult.trace) {
				console.groupCollapsed(`[CGPTOpt-Bg] Trace (Att:${attempt}) - ${scriptResult.success ? "Success" : "Fail"}`);
				scriptResult.trace.forEach((line) => console.log(line));
				console.groupEnd();
			}
			if (scriptResult && scriptResult.success) return scriptResult.text;
			else {
				if (attempt < 2 && scriptResult.error?.includes("UI Setup Failed")) {
					console.warn("[CGPTOpt-Bg] UI Setup failed. Retrying with fresh window...");
					if (workerWindowId) await chrome.windows.remove(workerWindowId).catch(() => {});
					workerWindowId = null;
					return handleOptimization(instruction, attempt + 1);
				}
				throw new Error(scriptResult?.error || "Automation script returned failure");
			}
		} else throw new Error("No result returned from automation script");
	} catch (err) {
		if (attempt < 2) {
			console.warn("[CGPTOpt-Bg] Error in handleOptimization. Retrying...", err.message);
			if (workerWindowId) {
				try {
					await chrome.windows.remove(workerWindowId);
				} catch (e) {}
				workerWindowId = null;
			}
			return handleOptimization(instruction, attempt + 1);
		}
		throw err;
	} finally {
		workerBusy = false;
		resetInactivityTimer();
	}
}
var inactivityTimer = null;
function resetInactivityTimer() {
	if (inactivityTimer) clearTimeout(inactivityTimer);
	inactivityTimer = setTimeout(() => {
		if (workerWindowId) {
			chrome.windows.remove(workerWindowId).catch(() => {});
			workerWindowId = null;
			workerTabId = null;
			console.log("[CGPTOpt-Bg] Worker window closed due to inactivity.");
		}
	}, 3e5);
}
function waitForTabComplete(tabId) {
	return new Promise((resolve) => {
		const check = (id, info) => {
			if (id === tabId && info.status === "complete") {
				chrome.tabs.onUpdated.removeListener(check);
				resolve();
			}
		};
		chrome.tabs.onUpdated.addListener(check);
		setTimeout(() => {
			chrome.tabs.onUpdated.removeListener(check);
			resolve();
		}, 1e4);
	});
}
/**
* Runs in the temporary tab - REFACTORED TO BE BULLETPROOF
*/
async function automateChatGPT(instruction) {
	const trace = [];
	const log = (msg) => {
		const entry = `[${(/* @__PURE__ */ new Date()).toISOString().split("T")[1].split(".")[0]}] ${msg}`;
		console.log("[CGPTOpt-Tab]", entry);
		trace.push(entry);
	};
	log("Automation speed-optimized started.");
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	if (window.location.href.includes("/auth/login")) return {
		success: false,
		error: "AUTH_REQUIRED",
		trace
	};
	const findElement = (selectors) => {
		const deepQuery = (root, selector) => {
			let el = root.querySelector(selector);
			if (el) return el;
			const hosts = Array.from(root.querySelectorAll("*")).filter((node) => node.shadowRoot);
			for (const host of hosts) {
				el = deepQuery(host.shadowRoot, selector);
				if (el) return el;
			}
			return null;
		};
		for (const selector of selectors) {
			const el = deepQuery(document, selector);
			if (el) return el;
		}
		return null;
	};
	const dismissModals = () => {
		const texts = [
			"OK",
			"Anladım",
			"Got it",
			"Stay in temporary",
			"Continue",
			"Devam et",
			"Dismiss"
		];
		const toClick = Array.from(document.querySelectorAll("button")).find((b) => texts.some((t) => b.innerText.includes(t)));
		if (toClick) {
			log(`Dismissing modal: ${toClick.innerText}`);
			toClick.click();
			return true;
		}
		return false;
	};
	try {
		log("Checking for initial modals...");
		dismissModals();
		await sleep(400);
		dismissModals();
		return {
			success: true,
			text: await new Promise((resolve, reject) => {
				let attempts = 0;
				const maxAttempts = 60;
				const waitUI = setInterval(async () => {
					const textarea = findElement([
						"#prompt-textarea",
						"div[contenteditable=\"true\"]",
						"textarea"
					]);
					const isCloudflare = document.body.innerText.includes("Checking your browser") || !!document.querySelector("#cf-turnstile");
					if (textarea) {
						clearInterval(waitUI);
						log("UI Detected.");
						proceedToInput(textarea);
					} else if (isCloudflare) log("Cloudflare detected.");
					else if (++attempts >= maxAttempts) {
						clearInterval(waitUI);
						reject(/* @__PURE__ */ new Error(`UI Not Found. Loc: ${window.location.pathname}`));
					}
				}, 300);
				async function proceedToInput(textarea) {
					log("Injecting...");
					const sendBtnSelectors = [
						"button[data-testid=\"send-button\"]",
						"button[aria-label=\"Send message\"]",
						"button:has(svg)"
					];
					let sendBtn = findElement(sendBtnSelectors);
					textarea.focus();
					document.execCommand("selectAll", false, null);
					document.execCommand("delete", false, null);
					document.execCommand("insertText", false, instruction);
					textarea.dispatchEvent(new Event("input", { bubbles: true }));
					textarea.dispatchEvent(new Event("change", { bubbles: true }));
					let readyAtt = 0;
					while ((!sendBtn || sendBtn.disabled) && readyAtt < 20) {
						await sleep(150);
						sendBtn = findElement(sendBtnSelectors);
						readyAtt++;
					}
					if (sendBtn && !sendBtn.disabled) {
						log("Submitting...");
						const mouseOpts = {
							bubbles: true,
							cancelable: true,
							view: window
						};
						sendBtn.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
						sendBtn.click();
						sendBtn.dispatchEvent(new MouseEvent("mouseup", mouseOpts));
						textarea.dispatchEvent(new KeyboardEvent("keydown", {
							key: "Enter",
							code: "Enter",
							keyCode: 13,
							which: 13,
							bubbles: true,
							cancelable: true
						}));
						let submitSuccess = false;
						for (let i = 0; i < 15; i++) {
							await sleep(150);
							if (findElement(["button[aria-label*=\"Stop\"]", "button[data-testid*=\"stop\"]"])) {
								submitSuccess = true;
								break;
							}
						}
						if (!submitSuccess) {
							const form = textarea.closest("form");
							if (form) form.dispatchEvent(new Event("submit", {
								bubbles: true,
								cancelable: true
							}));
						}
						startObservation();
					} else reject(/* @__PURE__ */ new Error(`Send button error. B:${!!sendBtn} D:${sendBtn?.disabled}`));
				}
				function startObservation() {
					log("Observing...");
					let lastCapturedText = "";
					let stableCount = 0;
					let generationDetected = false;
					let stopBtnVisibleBefore = false;
					const limit = 5e4;
					const startTime = Date.now();
					const obsInterval = setInterval(() => {
						const stopBtn = findElement(["button[aria-label*=\"Stop\"]", "button[data-testid*=\"stop\"]"]);
						const typingIndicator = document.querySelector(".result-streaming");
						if (stopBtn || typingIndicator) {
							generationDetected = true;
							stopBtnVisibleBefore = true;
						}
						const selectors = [
							"[data-message-author-role=\"assistant\"]",
							".markdown.prose",
							".agent-turn .markdown",
							"main article:last-of-type"
						];
						let lastMsg = null;
						for (const sel of selectors) {
							const found = document.querySelectorAll(sel);
							if (found.length > 0) {
								lastMsg = Array.from(found).pop();
								break;
							}
						}
						if (lastMsg) {
							const current = lastMsg.innerText.trim();
							if (current.length > 1) {
								generationDetected = true;
								if (current === lastCapturedText && current.length > 10) stableCount++;
								else {
									lastCapturedText = current;
									stableCount = 0;
								}
							}
						}
						if (generationDetected && stopBtnVisibleBefore && !stopBtn && !typingIndicator && lastCapturedText.length > 5) {
							clearInterval(obsInterval);
							resolve(lastCapturedText);
							return;
						}
						if (generationDetected && stableCount >= 12) {
							clearInterval(obsInterval);
							resolve(lastCapturedText);
							return;
						}
						if (Date.now() - startTime > limit) {
							clearInterval(obsInterval);
							reject(/* @__PURE__ */ new Error(`Timeout. G:${generationDetected}, L:${lastCapturedText.length}`));
						}
					}, 400);
				}
			})
		};
	} catch (err) {
		return {
			success: false,
			error: err.message
		};
	}
}
/**
* Directly hits Groq API for ultra-fast results
*/
async function handleGroqOptimization(instruction, apiKey) {
	const systemPrompt = `You are an expert Prompt Engineer. 
Optimize the user's prompt using CO-STAR framework (Context, Objective, Style, Tone, Audience, Response).
Wrap the final optimized prompt inside <FINAL_PROMPT> tags.
Do not provide any other explanation or text outside the tags.`;
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 15e3);
		const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Authorization": `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: "llama-3.1-8b-instant",
				messages: [{
					role: "system",
					content: systemPrompt
				}, {
					role: "user",
					content: `Optimize this prompt: ${instruction}`
				}],
				temperature: .6,
				max_tokens: 4e3
			})
		});
		clearTimeout(timeoutId);
		if (!response.ok) {
			const errData = await response.json().catch(() => ({}));
			throw new Error(errData.error?.message || `HTTP ${response.status}`);
		}
		let optimized = (await response.json()).choices[0].message.content;
		const match = optimized.match(/<FINAL_PROMPT>([\s\S]*?)<\/FINAL_PROMPT>/i);
		if (match && match[1]) optimized = match[1].trim();
		else optimized = optimized.replace(/<\/?FINAL_PROMPT>/gi, "").trim();
		return {
			success: true,
			optimized
		};
	} catch (err) {
		console.error("[CGPTOpt-Bg] Groq Error:", err);
		return {
			success: false,
			error: "Groq API Error: " + err.message
		};
	}
}
//#endregion
