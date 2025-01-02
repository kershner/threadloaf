import { ThreadloafState } from "./ThreadloafState";
import { MessageInfo } from "./MessageInfo";

/**
 * Handles DOM manipulation and UI element creation for the Threadloaf interface.
 * Responsible for creating message elements, managing styles, hiding Discord's
 * native thread header, and handling all direct modifications to the DOM.
 * Includes utilities for creating and styling message previews and expanded views.
 */
export class DomMutator {
    private state: ThreadloafState;

    constructor(state: ThreadloafState) {
        this.state = state;
    }

    public addScrollerStyle(scrollerClass: string): void {
        const styleId = `threadloaf-scroller-style-${scrollerClass}`;
        // Remove any existing style first
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            div.${scrollerClass} {
                overflow-y: hidden !important;
            }
        `;
        document.head.appendChild(style);
    }

    public removeScrollerStyle(scrollerClass: string): void {
        const styleId = `threadloaf-scroller-style-${scrollerClass}`;
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
    }

    // Create a message element
    public createMessageElement(
        message: MessageInfo,
        depth: number,
        color: string,
        isBold: boolean,
        commentNumber: number,
        totalMessages: number,
    ): HTMLElement {
        const el = document.createElement("div");
        el.classList.add("threadloaf-message");
        if (message.isError) {
            el.dataset.isError = "true";
        }
        el.style.width = "100%";

        // Preview container (always visible)
        const previewContainer = document.createElement("div");
        previewContainer.classList.add("preview-container");

        const contentPreview = document.createElement("span");
        contentPreview.classList.add("message-content", "preview");

        // Handle emojis specially
        // Create a temporary container to parse the content
        const temp = document.createElement("div");
        temp.innerHTML = message.htmlContent;

        // Remove reactions
        temp.querySelectorAll('[class*="reactions_"]').forEach((el) => el.remove());

        // Replace emoji images with their alt text
        temp.querySelectorAll('img[class*="emoji"]').forEach((img) => {
            if (img instanceof HTMLImageElement) {
                const text = img.alt || img.getAttribute("aria-label") || "";
                if (text) {
                    img.replaceWith(text);
                }
            }
        });

        // Replace <br> and block-level elements with spaces
        temp.querySelectorAll("br, p, div").forEach((el) => {
            el.replaceWith(" " + (el.textContent || "") + " ");
        });

        // Get text and normalize whitespace
        contentPreview.textContent = temp.textContent?.replace(/\s+/g, " ").trim() || "";

        contentPreview.style.color = color;
        if (isBold) {
            contentPreview.style.fontWeight = "bold";
        }

        const separator = document.createElement("span");
        separator.classList.add("separator");
        separator.textContent = " : ";

        const authorSpan = document.createElement("span");
        authorSpan.classList.add("message-author");
        authorSpan.textContent = message.author;

        previewContainer.appendChild(contentPreview);

        previewContainer.appendChild(separator);
        previewContainer.appendChild(authorSpan);

        // Full content container (shown when expanded)
        const fullContentContainer = document.createElement("div");
        fullContentContainer.classList.add("full-content");

        // Add username header and reply button container
        const headerContainer = document.createElement("div");
        headerContainer.classList.add("expanded-header");

        const expandedAuthor = document.createElement("span");
        expandedAuthor.classList.add("expanded-author");
        expandedAuthor.textContent = message.author;

        const rightContainer = document.createElement("div");
        rightContainer.classList.add("expanded-header-right");

        // Add navigation arrows
        const prevArrow = document.createElement("button");
        prevArrow.classList.add("nav-arrow", "prev");
        prevArrow.textContent = "←";
        prevArrow.disabled = commentNumber === 1;
        prevArrow.onclick = (e) => {
            e.stopPropagation();
            // Find the message with the next lowest timestamp
            const currentTimestamp = message.timestamp;
            const targetMessage = Array.from(document.querySelectorAll(".threadloaf-message"))
                .map((el) => ({
                    element: el as HTMLElement,
                    timestamp: parseInt((el as HTMLElement).dataset.timestamp || "0"),
                }))
                .filter((m) => m.timestamp < currentTimestamp)
                .sort((a, b) => b.timestamp - a.timestamp)[0]?.element;

            if (targetMessage) {
                // Collapse current message
                el.classList.remove("expanded");
                previewContainer.style.display = "flex";
                fullContentContainer.style.display = "none";

                // Expand target message
                targetMessage.classList.add("expanded");
                const targetPreview = targetMessage.querySelector(".preview-container") as HTMLElement;
                const targetFull = targetMessage.querySelector(".full-content") as HTMLElement;
                if (targetPreview) targetPreview.style.display = "none";
                if (targetFull) targetFull.style.display = "block";

                targetMessage.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        };

        const upArrow = document.createElement("button");
        upArrow.classList.add("nav-arrow", "up");
        upArrow.textContent = "↑";
        upArrow.disabled = !message.parentId;
        upArrow.onclick = (e) => {
            e.stopPropagation();
            if (message.parentId) {
                const parentEl = document.querySelector(`[data-msg-id="${message.parentId}"]`) as HTMLElement;
                if (parentEl) {
                    // Collapse current message
                    el.classList.remove("expanded");
                    previewContainer.style.display = "flex";
                    fullContentContainer.style.display = "none";

                    // Expand parent message
                    parentEl.classList.add("expanded");
                    const parentPreview = parentEl.querySelector(".preview-container") as HTMLElement;
                    const parentFull = parentEl.querySelector(".full-content") as HTMLElement;
                    if (parentPreview) parentPreview.style.display = "none";
                    if (parentFull) parentFull.style.display = "block";

                    parentEl.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
        };

        const nextArrow = document.createElement("button");
        nextArrow.classList.add("nav-arrow", "next");
        nextArrow.textContent = "→";
        nextArrow.disabled = commentNumber === totalMessages;
        nextArrow.onclick = (e) => {
            e.stopPropagation();
            // Find the message with the next highest timestamp
            const currentTimestamp = message.timestamp;
            const targetMessage = Array.from(document.querySelectorAll(".threadloaf-message"))
                .map((el) => ({
                    element: el as HTMLElement,
                    timestamp: parseInt((el as HTMLElement).dataset.timestamp || "0"),
                }))
                .filter((m) => m.timestamp > currentTimestamp)
                .sort((a, b) => a.timestamp - b.timestamp)[0]?.element;

            if (targetMessage) {
                // Collapse current message
                el.classList.remove("expanded");
                previewContainer.style.display = "flex";
                fullContentContainer.style.display = "none";

                // Expand target message
                targetMessage.classList.add("expanded");
                const targetPreview = targetMessage.querySelector(".preview-container") as HTMLElement;
                const targetFull = targetMessage.querySelector(".full-content") as HTMLElement;
                if (targetPreview) targetPreview.style.display = "none";
                if (targetFull) targetFull.style.display = "block";

                targetMessage.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        };

        // Create and add the Actions button
        const replyButton = document.createElement("button");
        replyButton.classList.add("reply-button");
        replyButton.textContent = "Actions";
        replyButton.onclick = (e) => {
            e.stopPropagation(); // Prevent collapsing when clicking actions

            if (!message.originalElement) {
                console.error("No original element reference found for message");
                return;
            }

            // Try to trigger context menu on each ancestor until one responds
            let currentElement: Element | null = message.originalElement.querySelector('[id^="message-content-"]');
            if (!currentElement) {
                console.error("Message content element not found in:", message.originalElement);
                return;
            }

            // Set up menu positioning style before triggering context menu
            const buttonRect = replyButton.getBoundingClientRect();
            const isBottomHalf = buttonRect.bottom > window.innerHeight / 2;
            const styleId = "threadloaf-menu-position";
            let styleEl = document.getElementById(styleId);
            if (!styleEl) {
                styleEl = document.createElement("style");
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }

            // Update the style with the new position, aligning menu's right with button's right
            styleEl.textContent = `
                div[class*="menu_"]:not([class*="submenu_"]) {
                    position: fixed !important;
                    ${isBottomHalf ? "bottom" : "top"}: ${isBottomHalf ? `${window.innerHeight - buttonRect.top + 2}px` : `${buttonRect.bottom + 2}px`};
                    right: ${window.innerWidth - buttonRect.right}px;
                }
            `;

            // Set up a mutation observer to watch for the menu being removed
            const observer = new MutationObserver((mutations) => {
                // Does div.menu_* still exist on the page?
                const menuExists = document.querySelector('div[class*="menu_"]');
                if (!menuExists) {
                    // Menu was removed, clean up our styles
                    styleEl.remove();
                    observer.disconnect();
                }
            });

            // Start observing the document body for removed nodes
            observer.observe(document.body, { childList: true, subtree: true });

            while (currentElement && currentElement !== message.originalElement.parentElement) {
                const contextEvent = new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 2,
                    buttons: 2,
                });

                const wasHandled = !currentElement.dispatchEvent(contextEvent);

                if (wasHandled) {
                    break;
                }
                currentElement = currentElement.parentElement;
            }
        };

        rightContainer.appendChild(prevArrow);
        rightContainer.appendChild(upArrow);
        rightContainer.appendChild(nextArrow);
        rightContainer.appendChild(replyButton);

        headerContainer.appendChild(expandedAuthor);
        headerContainer.appendChild(rightContainer);

        const messageContent = document.createElement("div");
        messageContent.classList.add("message-content-expanded");
        messageContent.innerHTML = message.htmlContent;

        fullContentContainer.appendChild(headerContainer);
        fullContentContainer.appendChild(messageContent);

        // Create a container for embeds if they exist
        const embedsContainer = document.createElement("div");
        embedsContainer.classList.add("embeds-container");

        // Add embeds from messageContent to embedsContainer
        const embedLinks = messageContent.querySelector(".embed-links");
        if (embedLinks) {
            messageContent.removeChild(embedLinks);
            embedsContainer.appendChild(embedLinks);
        }

        fullContentContainer.appendChild(embedsContainer);

        // Create reactions container (always present in expanded view)
        const reactionsContainer = document.createElement("div");
        reactionsContainer.classList.add("reactions-container");

        // Create a left container for reactions
        const reactionsLeft = document.createElement("div");
        reactionsLeft.classList.add("reactions-left");

        // Move existing reactions if present
        const reactionsClone = fullContentContainer.querySelector('[class*="reactions_"]');
        if (reactionsClone) {
            reactionsClone.remove();
            // Create a wrapper for existing reactions
            const existingReactions = document.createElement("div");
            existingReactions.classList.add("existing-reactions");
            existingReactions.appendChild(reactionsClone);
            reactionsLeft.appendChild(existingReactions);
        }

        // Create timestamp for the right side
        const timestamp = document.createElement("span");
        timestamp.classList.add("expanded-timestamp");
        timestamp.textContent = new Date(message.timestamp).toLocaleString();

        reactionsContainer.appendChild(reactionsLeft);
        reactionsContainer.appendChild(timestamp);

        fullContentContainer.appendChild(reactionsContainer);

        fullContentContainer.style.display = "none";

        el.appendChild(previewContainer);
        el.appendChild(fullContentContainer);
        el.dataset.msgId = message.id;
        el.dataset.msgNumber = commentNumber.toString();

        el.addEventListener("click", () => {
            // If already expanded, do nothing
            if (el.classList.contains("expanded")) {
                return;
            }

            // Collapse any other expanded messages first
            document.querySelectorAll(".threadloaf-message.expanded").forEach((expandedEl) => {
                if (expandedEl !== el) {
                    expandedEl.classList.remove("expanded");
                    const prevContainer = expandedEl.querySelector(".preview-container") as HTMLElement;
                    const prevFullContent = expandedEl.querySelector(".full-content") as HTMLElement;
                    if (prevContainer) prevContainer.style.display = "flex";
                    if (prevFullContent) prevFullContent.style.display = "none";
                }
            });

            // Expand this message
            el.classList.add("expanded");
            previewContainer.style.display = "none";
            fullContentContainer.style.display = "block";
        });

        // When creating the element, store the timestamp
        el.dataset.timestamp = message.timestamp.toString();

        return el;
    }

    // Inject CSS styles for the thread UI
    public injectStyles(): void {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = chrome.runtime.getURL("styles.css");
        document.head.appendChild(link);
    }

    public findAndHideHeader(): void {
        const headers = document.querySelectorAll('div[class*=" "]');
        for (const header of Array.from(headers)) {
            const classes = Array.from(header.classList);
            const hasContainerClass = classes.some((cls) => cls.startsWith("container_"));
            const hasHeaderClass = classes.some((cls) => cls.startsWith("header_"));
            if (hasContainerClass && hasHeaderClass && header instanceof HTMLElement) {
                header.style.display = "none";
                break;
            }
        }
    }
}
