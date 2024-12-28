// content_script.ts

interface MessageInfo {
    id: string;
    author: string;
    timestamp: number; // Unix timestamp in milliseconds
    content: string;
    htmlContent: string;
    parentId?: string; // Parent message ID (if reply)
    parentPreview?: { author: string; content: string }; // Preview of parent message if available
    children?: MessageInfo[]; // List of child messages
    isGhost?: boolean; // Whether this is a placeholder for a missing message
    messageNumber?: number; // Optional message number
}

class Threadloaf {
    private appContainer: HTMLElement | null = null;
    private threadContainer: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private headerObserver: MutationObserver | null = null;
    private isThreadViewActive: boolean = false; // Changed from true to false to start in chat view

    constructor() {
        this.initialize();
    }

    // Entry point for initialization
    private initialize(): void {
        this.appContainer = this.findAppContainer();
        if (!this.appContainer) {
            console.error("Threadloaf: Failed to find app container. Aborting initialization.");
            return;
        }
        this.injectStyles();
        this.setupHeaderObserver();
        this.setupMutationObserver();
        this.setupPolling();
        this.setupKeyboardNavigation();

        // Find initial thread container and set up initial view
        const initialThreadContainer = this.findThreadContainer();
        if (initialThreadContainer) {
            this.threadContainer = initialThreadContainer;
            // Show the chat view and create float button
            this.threadContainer.style.display = "block";
            this.renderThread(); // This will create the button in chat view mode
        }
    }

    // Locate the top-level app container
    private findAppContainer(): HTMLElement | null {
        return document.querySelector("#app-mount");
    }

    // Locate the thread container dynamically
    private findThreadContainer(): HTMLElement | null {
        const elements = document.querySelectorAll<HTMLElement>('ol[class^="scrollerInner_"]');
        const threadContainer =
            Array.from(elements).find((el) => {
                return el.getAttribute("data-list-id") === "chat-messages" && el.children.length > 0;
            }) || null;

        if (threadContainer && this.isThreadViewActive) {
            // Only apply scroll override in thread view
            // Find and disable scrolling on the original scroller
            const scrollerElement = threadContainer.closest('div[class*="scroller_"]');
            if (scrollerElement) {
                const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                    className.startsWith("scroller_"),
                );
                if (scrollerClass) {
                    // Add the class to our styles to disable its scrolling
                    this.addScrollerStyle(scrollerClass);
                }
            }
        }

        return threadContainer;
    }

    private addScrollerStyle(scrollerClass: string): void {
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

    private removeScrollerStyle(scrollerClass: string): void {
        const styleId = `threadloaf-scroller-style-${scrollerClass}`;
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
    }

    // Parse all messages in the thread container
    private parseMessages(): MessageInfo[] {
        if (!this.threadContainer) return [];

        const messages = Array.from(this.threadContainer.querySelectorAll('li[id^="chat-messages-"]')).map((el) => {
            const id = el.id.split("-").pop() || "";

            const contentsEl = el.querySelector('[class^="contents_"]');
            if (!contentsEl) {
                console.log("el", el);
                throw new Error("Failed to find contents element. Aborting message parsing.");
            }

            const headerEl = contentsEl.querySelector('[class^="header_"]');
            if (!headerEl) {
                console.log("contentsEl", contentsEl);
                throw new Error("Failed to find header element. Aborting message parsing.");
            }

            const author = headerEl
                .querySelector('[id^="message-username-"] > span[class^="username_"]')
                ?.textContent?.trim();
            if (!author) {
                console.log("headerEl", headerEl);
                throw new Error("Failed to find author element. Aborting message parsing.");
            }

            const timestampEl = headerEl.querySelector("time");
            if (!timestampEl) {
                console.log("headerEl", headerEl);
                throw new Error("Failed to find timestamp element. Aborting message parsing.");
            }

            const dateTime = timestampEl.getAttribute("datetime");
            if (!dateTime) {
                console.log("timestampEl", timestampEl);
                throw new Error("Failed to find datetime attribute. Aborting message parsing.");
            }

            const timestamp = new Date(dateTime).getTime();

            const messageContentEl = contentsEl.querySelector('[id^="message-content-"]');
            if (!messageContentEl) {
                console.log("contentsEl", contentsEl);
                throw new Error("Failed to find message content element. Aborting message parsing.");
            }

            // Find accessories/embeds container
            const accessoriesId = `message-accessories-${id}`;
            const accessoriesEl = el.querySelector(`#${accessoriesId}`);

            // Find reactions container
            const reactionsEl = el.querySelector('[class*="reactions_"]');

            // Debug image detection in both content and accessories
            const contentImages = messageContentEl.querySelectorAll("img:not([class*='emoji_'])");
            const accessoryImages = accessoriesEl
                ? accessoriesEl.querySelectorAll("img:not([class*='emoji_']):not([class*='reaction'])")
                : [];
            const totalImages = contentImages.length + accessoryImages.length;

            // Get text content for preview, handling image-only messages
            let textContent = messageContentEl.textContent || "";

            // If there's no text content, check if it's just emojis
            if (!textContent) {
                const emojiContent = Array.from(messageContentEl.querySelectorAll('img[class*="emoji"]'))
                    .map(
                        (img) =>
                            (img instanceof HTMLImageElement ? img.alt : "") || img.getAttribute("aria-label") || "",
                    )
                    .join("");

                if (emojiContent) {
                    textContent = emojiContent;
                } else if (totalImages > 0) {
                    textContent = "🖼️ Image";
                } else if (accessoriesEl) {
                    const links = accessoriesEl.querySelectorAll("a[href]");
                    if (links.length > 0) {
                        textContent = "🔗 Link";
                    }
                }
            } else {
                // Convert line breaks to spaces for preview
                textContent = textContent.replace(/\s*[\r\n]+\s*/g, " ").trim();

                // Add embed indicators to the preview if present
                if (totalImages > 0) {
                    textContent += " 🖼️ Image";
                } else if (accessoriesEl) {
                    const links = accessoriesEl.querySelectorAll("a[href]");
                    if (links.length > 0) {
                        textContent += " 🔗 Link";
                    }
                }
            }

            // Clone both content and accessories
            const contentClone = messageContentEl.cloneNode(true) as HTMLElement;
            let fullContent = contentClone;

            if (accessoriesEl) {
                // Convert embeds to plain text links (excluding reactions)
                const links = Array.from(
                    accessoriesEl.querySelectorAll<HTMLAnchorElement>('a[href]:not([class*="reaction"])'),
                ).map((a) => a.href);
                const images = Array.from(
                    accessoriesEl.querySelectorAll<HTMLImageElement>('img[src]:not([data-type="emoji"])'),
                ).map((img) => img.src);

                // Create a container for content, links, and reactions
                const container = document.createElement("div");
                container.appendChild(contentClone);

                // Add reactions if present
                if (reactionsEl) {
                    const reactionsClone = reactionsEl.cloneNode(true) as HTMLElement;
                    // Remove the "add reaction" button
                    const addReactionBtn = reactionsClone.querySelector('div[class*="reactionBtn_"]');
                    if (addReactionBtn) {
                        addReactionBtn.remove();
                    }
                    container.appendChild(reactionsClone);
                }

                // Add all unique links
                const uniqueLinks = [...new Set([...links, ...images])];
                if (uniqueLinks.length > 0) {
                    const linkList = document.createElement("div");
                    linkList.classList.add("embed-links");

                    uniqueLinks.forEach((url) => {
                        const link = document.createElement("a");
                        link.href = url;
                        // Truncate long URLs
                        if (url.length > 70) {
                            const start = url.slice(0, 35);
                            const end = url.slice(-30);
                            link.textContent = `${start}...${end}`;
                            link.title = url; // Show full URL on hover
                        } else {
                            link.textContent = url;
                        }
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";

                        const linkContainer = document.createElement("div");
                        linkContainer.appendChild(link);
                        linkList.appendChild(linkContainer);
                    });

                    container.appendChild(linkList);
                }

                fullContent = container;
            }

            // Fix all image sources in the cloned content
            fullContent.querySelectorAll("img").forEach((img, idx) => {
                const originalSrc = img.src;
                if (img.src) {
                    img.src = img.src; // Force a re-assignment to resolve any relative URLs
                }
                if (img.getAttribute("aria-label")) {
                    img.alt = img.getAttribute("aria-label") || "";
                }
            });

            let parentId: string | undefined = undefined;
            let parentPreview: { author: string; content: string } | undefined = undefined;
            const replyContextMaybe = el.querySelector('[id^="message-reply-context-"]');
            if (replyContextMaybe) {
                const parentContentEl = replyContextMaybe.querySelector('[id^="message-content-"]');
                parentId = parentContentEl?.id.split("-").pop() || "";

                // Extract parent preview content and author
                const repliedTextContent = replyContextMaybe.querySelector('[class*="repliedTextContent_"]');
                const parentAuthorEl = replyContextMaybe.querySelector('[class*="username_"]');
                if (repliedTextContent && parentAuthorEl) {
                    parentPreview = {
                        author: parentAuthorEl.textContent?.trim().replace(/^@/, "") || "Unknown",
                        content: repliedTextContent.innerHTML,
                    };
                }
            }

            return {
                id,
                author,
                timestamp,
                content: textContent,
                htmlContent: fullContent.innerHTML,
                parentId,
                parentPreview,
                children: [],
            };
        });

        return messages;
    }

    // Build a hierarchical message tree
    private buildMessageTree(messages: MessageInfo[]): MessageInfo[] {
        // Sort messages chronologically for processing
        const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);
        const THREE_MINUTES = 3 * 60 * 1000; // milliseconds

        // Phase 1: Coalescing
        const coalescedMessages: MessageInfo[] = [];
        const coalescedIds = new Set<string>();

        for (let i = 0; i < sortedMessages.length; i++) {
            const message = sortedMessages[i];

            // Skip if this message has been coalesced into another
            if (coalescedIds.has(message.id)) continue;

            // If this isn't an explicit reply, look for a recent message from the same author
            if (!message.parentId) {
                const recentSameAuthorIndex = sortedMessages
                    .slice(0, i)
                    .reverse()
                    .findIndex(
                        (m) =>
                            !coalescedIds.has(m.id) &&
                            m.author === message.author &&
                            message.timestamp - m.timestamp <= THREE_MINUTES,
                    );

                if (recentSameAuthorIndex !== -1) {
                    // Convert from reverse index to actual index
                    const actualIndex = i - 1 - recentSameAuthorIndex;
                    const recentSameAuthor = sortedMessages[actualIndex];

                    // Find the corresponding message in coalescedMessages
                    const targetMessage = coalescedMessages.find((m) => m.id === recentSameAuthor.id);
                    if (targetMessage) {
                        // Coalesce this message into the target
                        targetMessage.htmlContent += `<br>${message.htmlContent}`;
                        targetMessage.content += ` ${message.content}`;
                        coalescedIds.add(message.id);
                        continue;
                    }
                }
            }

            // Add a deep copy of the message
            coalescedMessages.push({
                ...message,
                htmlContent: message.htmlContent,
                content: message.content,
                children: [],
            });
        }

        // Phase 2: Building the tree with reparenting and ghost messages
        const idToMessage = new Map<string, MessageInfo>();
        const rootMessages: MessageInfo[] = [];

        // Initialize all messages in the map
        for (const message of coalescedMessages) {
            message.children = [];
            idToMessage.set(message.id, message);
        }

        // Now handle parenting
        for (const message of coalescedMessages) {
            let effectiveParentId = message.parentId;

            // If this is not an explicit reply, try to find an implicit parent
            if (!effectiveParentId) {
                // Look for any recent message within 3 minutes
                const recentMessage = coalescedMessages
                    .slice(0, coalescedMessages.indexOf(message))
                    .reverse()
                    .find((m) => message.timestamp - m.timestamp <= THREE_MINUTES);

                if (recentMessage) {
                    effectiveParentId = recentMessage.id;
                } else {
                    rootMessages.push(message);
                    continue;
                }
            }

            // Link message to its parent
            if (effectiveParentId) {
                const parent = idToMessage.get(effectiveParentId);
                if (parent) {
                    parent.children?.push(message);
                    message.parentId = effectiveParentId;
                } else {
                    // Create a ghost message for the missing parent using preview info
                    const ghostMessage: MessageInfo = {
                        id: effectiveParentId,
                        author: message.parentPreview?.author || "Unknown",
                        timestamp: message.timestamp - 1, // Place just before the child
                        content: message.parentPreview?.content || "Message not loaded",
                        // Use the HTML content directly from the preview
                        htmlContent: message.parentPreview?.content || "Message not loaded",
                        children: [message],
                        isGhost: true,
                    };

                    // If we have HTML content, create a temporary div to properly parse emojis and formatting
                    if (message.parentPreview?.content) {
                        const tempDiv = document.createElement("div");
                        tempDiv.innerHTML = message.parentPreview.content;

                        // Convert emoji images to their alt text
                        tempDiv.querySelectorAll('img[class*="emoji"]').forEach((img) => {
                            if (img instanceof HTMLImageElement) {
                                const text = img.alt || img.getAttribute("aria-label") || "";
                                if (text) {
                                    img.replaceWith(text);
                                }
                            }
                        });

                        ghostMessage.content = tempDiv.textContent || "Message not loaded";
                        ghostMessage.htmlContent = tempDiv.innerHTML;
                    }

                    idToMessage.set(effectiveParentId, ghostMessage);
                    message.parentId = effectiveParentId;
                    rootMessages.push(ghostMessage);
                }
            }
        }

        return rootMessages;
    }

    // Render the thread UI
    private renderThread(): void {
        if (!this.threadContainer) return;

        // Clean up any existing threadloaf containers first
        const existingContainer = document.getElementById("threadloaf-container");
        if (existingContainer) {
            existingContainer.remove();
        }

        const threadloafContainer = document.createElement("div");
        threadloafContainer.id = "threadloaf-container";

        // Create a separate container for thread content
        const threadContent = document.createElement("div");
        threadContent.id = "threadloaf-content";
        threadloafContainer.appendChild(threadContent);

        // Create floating toggle button
        const createFloatButton = (isThreadView: boolean) => {
            const existingButton = document.getElementById("threadloaf-float-button");
            if (existingButton) {
                existingButton.remove();
            }

            const floatButton = document.createElement("div");
            floatButton.id = "threadloaf-float-button";

            // Create Chat option
            const chatOption = document.createElement("button");
            chatOption.className = `toggle-option ${!isThreadView ? "active" : ""}`;
            chatOption.textContent = "Chat";

            // Create Thread option
            const threadOption = document.createElement("button");
            threadOption.className = `toggle-option ${isThreadView ? "active" : ""}`;
            threadOption.textContent = "Thread";

            const handleClick = (newIsThreadView: boolean) => {
                if (newIsThreadView === isThreadView) return; // No change needed

                this.isThreadViewActive = newIsThreadView; // Update the view state

                if (newIsThreadView) {
                    // Switch to thread view
                    if (this.threadContainer) {
                        this.threadContainer.style.display = "none";
                        // Re-add our scroll override
                        const scrollerElement = this.threadContainer.closest('div[class*="scroller_"]');
                        if (scrollerElement) {
                            const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                                className.startsWith("scroller_"),
                            );
                            if (scrollerClass) {
                                this.addScrollerStyle(scrollerClass);
                            }
                        }
                    }
                    // Re-render thread to get latest messages
                    this.renderThread();
                    createFloatButton(true);
                    // Scroll thread view to bottom
                    const threadContent = document.getElementById("threadloaf-content");
                    if (threadContent) {
                        threadContent.scrollTop = threadContent.scrollHeight;
                    }
                } else {
                    // Switch to normal view
                    if (this.threadContainer) {
                        this.threadContainer.style.display = "block";
                        // Remove our scroll override
                        const scrollerElement = this.threadContainer.closest('div[class*="scroller_"]');
                        if (scrollerElement) {
                            const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                                className.startsWith("scroller_"),
                            );
                            if (scrollerClass) {
                                this.removeScrollerStyle(scrollerClass);
                            }
                            // Scroll chat view to bottom
                            scrollerElement.scrollTop = scrollerElement.scrollHeight;
                        }
                    }
                    // Clean up threadloaf container when switching to chat view
                    const threadloafContainer = document.getElementById("threadloaf-container");
                    if (threadloafContainer) {
                        threadloafContainer.remove();
                    }
                    createFloatButton(false);
                }
            };

            chatOption.onclick = () => handleClick(false);
            threadOption.onclick = () => handleClick(true);

            floatButton.appendChild(chatOption);
            floatButton.appendChild(threadOption);
            document.body.appendChild(floatButton);

            // Position the button initially
            this.updateFloatButtonPosition();

            // Set up resize observer for the channel container
            const channelContainer = this.threadContainer?.closest('div[class*="chat_"]');
            if (channelContainer) {
                const resizeObserver = new ResizeObserver(() => {
                    this.updateFloatButtonPosition();
                });
                resizeObserver.observe(channelContainer);
            }

            // Also handle window resize
            window.addEventListener("resize", () => {
                this.updateFloatButtonPosition();
            });
        };

        // Initial floating button creation
        createFloatButton(false);

        // Parse messages and build tree
        const rawMessages = this.parseMessages();

        // Build the tree (which includes coalescing)
        const rootMessages = this.buildMessageTree(rawMessages);

        // Flatten the tree to get all messages in display order
        const getAllMessages = (messages: MessageInfo[]): MessageInfo[] => {
            const result: MessageInfo[] = [];
            const flatten = (msgs: MessageInfo[]) => {
                msgs.forEach((msg) => {
                    result.push(msg);
                    if (msg.children && msg.children.length > 0) {
                        flatten(msg.children);
                    }
                });
            };
            flatten(rootMessages);
            return result;
        };

        const allMessages = getAllMessages(rootMessages);

        // Now assign numbers to all messages in display order
        allMessages.forEach((msg, index) => {
            msg.messageNumber = index + 1;
        });

        // Sort for color grading (newest first)
        const colorSortedMessages = [...allMessages].sort((a, b) => b.timestamp - a.timestamp);
        const messageColors = new Map<string, string>();
        const messageBold = new Map<string, boolean>();

        // Set colors for the newest 15 messages
        const baseGray = 128; // Medium gray
        const numGradientMessages = Math.min(15, colorSortedMessages.length);

        colorSortedMessages.forEach((msg, index) => {
            if (index === 0) {
                // Newest message gets white and bold
                messageColors.set(msg.id, "rgb(255, 255, 255)");
                messageBold.set(msg.id, true);
            } else if (index < numGradientMessages) {
                // Next 14 messages get gradient from just above medium gray to near-white
                const colorValue = Math.floor(
                    baseGray + ((255 - baseGray) * (numGradientMessages - index)) / numGradientMessages,
                );
                messageColors.set(msg.id, `rgb(${colorValue}, ${colorValue}, ${colorValue})`);
                messageBold.set(msg.id, false);
            } else {
                // Older messages get medium gray
                messageColors.set(msg.id, `rgb(${baseGray}, ${baseGray}, ${baseGray})`);
                messageBold.set(msg.id, false);
            }
        });

        // Clear only the thread content
        threadContent.innerHTML = "";

        const renderMessages = (messages: MessageInfo[], depth = 0) => {
            const container = document.createElement("div");
            container.classList.add("message-thread");

            // Helper function to recursively flatten the tree
            const flattenMessages = (msgs: MessageInfo[], currentDepth: number): Array<[MessageInfo, number]> => {
                const result: Array<[MessageInfo, number]> = [];
                msgs.forEach((msg) => {
                    result.push([msg, currentDepth]);
                    if (msg.children && msg.children.length > 0) {
                        result.push(...flattenMessages(msg.children, currentDepth + 1));
                    }
                });
                return result;
            };

            // Get flattened list of [message, depth] pairs
            const flatMessages = flattenMessages(messages, depth);

            // Calculate incremental indents
            const MAX_INDENT = 350;
            const FIRST_LEVEL_INDENT = 40;
            const DECAY_RATE = -Math.log(1 - FIRST_LEVEL_INDENT / MAX_INDENT);
            const getIncrementalIndent = (level: number): number => {
                const totalIndentPrev =
                    level === 0 ? 0 : Math.round(MAX_INDENT * (1 - Math.exp(-DECAY_RATE * (level - 1))));
                const totalIndentCurr = Math.round(MAX_INDENT * (1 - Math.exp(-DECAY_RATE * level)));
                return totalIndentCurr - totalIndentPrev;
            };

            // Create message elements
            flatMessages.forEach(([message, depth]) => {
                const messageContainer = document.createElement("div");
                messageContainer.style.display = "flex";
                messageContainer.style.alignItems = "flex-start";
                messageContainer.style.minWidth = "0"; // Allow container to shrink below children's natural width

                // Create indent spacers
                for (let i = 0; i < depth; i++) {
                    const spacer = document.createElement("div");
                    spacer.style.display = "inline-block";
                    spacer.style.width = `${getIncrementalIndent(i + 1)}px`;
                    spacer.style.flexShrink = "0"; // Prevent spacer from shrinking
                    spacer.style.alignSelf = "stretch";
                    messageContainer.appendChild(spacer);
                }

                const messageEl = this.createMessageElement(
                    message,
                    0, // depth is now 0 since we handle indentation here
                    messageColors.get(message.id) || "",
                    messageBold.get(message.id) || false,
                    message.messageNumber || 0,
                    allMessages.length,
                );
                messageEl.style.minWidth = "0"; // Allow message to shrink
                messageEl.style.flexShrink = "1"; // Allow message to shrink
                messageEl.style.flexGrow = "1"; // Allow message to grow
                messageEl.style.overflow = "hidden"; // Ensure content doesn't overflow

                messageContainer.appendChild(messageEl);
                container.appendChild(messageContainer);
            });

            return container;
        };

        threadContent.appendChild(renderMessages(rootMessages));

        // Hide original thread container and append custom UI
        if (this.isThreadViewActive) {
            this.threadContainer.style.display = "none";
            const parentElement = this.threadContainer.parentElement;
            if (parentElement) {
                parentElement.style.position = "relative";
                parentElement.appendChild(threadloafContainer);
            }
        } else {
            this.threadContainer.style.display = "block";
            // Remove any existing threadloaf container
            const existingContainer = document.getElementById("threadloaf-container");
            if (existingContainer) {
                existingContainer.remove();
            }
        }

        // Try to hide header again after rendering
        this.findAndHideHeader();
    }

    // Create a message element
    private createMessageElement(
        message: MessageInfo,
        depth: number,
        color: string,
        isBold: boolean,
        commentNumber: number,
        totalMessages: number,
    ): HTMLElement {
        const el = document.createElement("div");
        el.classList.add("threadloaf-message");
        if (message.isGhost) {
            el.classList.add("ghost-message");
        }
        el.style.width = "100%"; // Take up remaining space after spacers

        // Preview container (always visible)
        const previewContainer = document.createElement("div");
        previewContainer.classList.add("preview-container");

        const contentPreview = document.createElement("span");
        contentPreview.classList.add("message-content", "preview");

        // For non-ghost messages, handle emojis specially
        if (!message.isGhost) {
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
        } else {
            contentPreview.textContent = message.content;
        }

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
        // Only add separator and author if we have an author (empty ghost messages don't)
        if (message.author) {
            previewContainer.appendChild(separator);
            previewContainer.appendChild(authorSpan);
        }

        // Full content container (shown when expanded)
        const fullContentContainer = document.createElement("div");
        fullContentContainer.classList.add("full-content");

        // Add username header and reply button container
        const headerContainer = document.createElement("div");
        headerContainer.classList.add("expanded-header");

        // Create navigation buttons for expanded view
        const expandedPillContainer = document.createElement("div");
        expandedPillContainer.classList.add("expanded-pill-container");

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

        expandedPillContainer.appendChild(prevArrow);
        expandedPillContainer.appendChild(upArrow);
        expandedPillContainer.appendChild(nextArrow);

        const expandedAuthor = document.createElement("span");
        expandedAuthor.classList.add("expanded-author");
        expandedAuthor.textContent = message.author;

        const rightContainer = document.createElement("div");
        rightContainer.classList.add("expanded-header-right");

        const timestamp = document.createElement("span");
        timestamp.classList.add("expanded-timestamp");
        timestamp.textContent = new Date(message.timestamp).toLocaleString();

        const replyButton = document.createElement("button");
        replyButton.classList.add("reply-button");
        replyButton.textContent = "Reply";
        replyButton.onclick = (e) => {
            e.stopPropagation(); // Prevent collapsing when clicking reply
        };

        headerContainer.appendChild(expandedPillContainer);
        headerContainer.appendChild(expandedAuthor);
        rightContainer.appendChild(timestamp);
        rightContainer.appendChild(replyButton);
        headerContainer.appendChild(rightContainer);

        const messageContent = document.createElement("div");
        messageContent.classList.add("message-content-expanded");
        messageContent.innerHTML = message.htmlContent;

        fullContentContainer.appendChild(headerContainer);
        fullContentContainer.appendChild(messageContent);

        // Create a container for embeds if they exist
        const embedsContainer = document.createElement("div");
        embedsContainer.classList.add("embeds-container");

        // Move embeds from messageContent to embedsContainer
        const embedLinks = messageContent.querySelector(".embed-links");
        if (embedLinks) {
            messageContent.removeChild(embedLinks);
            embedsContainer.appendChild(embedLinks);
        }

        // Add ghost notice if this is a ghost message
        if (message.isGhost) {
            const ghostNotice = document.createElement("div");
            ghostNotice.classList.add("ghost-notice");
            ghostNotice.textContent = "Full message not loaded";
            messageContent.appendChild(ghostNotice);
        }

        fullContentContainer.appendChild(embedsContainer);

        // Create reactions container (always present in expanded view)
        const reactionsContainer = document.createElement("div");
        reactionsContainer.classList.add("reactions-container");

        // Add the "Add Reaction" button first
        const addReactionButton = document.createElement("button");
        addReactionButton.classList.add("add-reaction-button");
        addReactionButton.innerHTML = '<span class="add-reaction-icon">+</span>';
        addReactionButton.title = "Add Reaction (coming soon)";
        addReactionButton.disabled = true;
        addReactionButton.onclick = (e) => {
            e.stopPropagation();
        };
        reactionsContainer.appendChild(addReactionButton);

        // Move existing reactions if present
        const reactionsClone = fullContentContainer.querySelector('[class*="reactions_"]');
        if (reactionsClone) {
            reactionsClone.remove();
            // Create a wrapper for existing reactions
            const existingReactions = document.createElement("div");
            existingReactions.classList.add("existing-reactions");
            existingReactions.appendChild(reactionsClone);
            reactionsContainer.appendChild(existingReactions);
        }

        fullContentContainer.appendChild(reactionsContainer);

        fullContentContainer.style.display = "none";

        // Insert expanded pill container before the expanded author
        headerContainer.insertBefore(expandedPillContainer, expandedAuthor);

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

    private highlightMessage(number: number): void {
        // Remove any existing highlights and clear any pending fade timeouts
        document.querySelectorAll(".threadloaf-message.highlighted").forEach((el) => {
            el.classList.remove("highlighted");
            el.classList.remove("fade-out");
            const timeoutId = el.getAttribute("data-fade-timeout");
            if (timeoutId) {
                clearTimeout(parseInt(timeoutId));
            }
        });

        // Find and highlight the target message
        const messages = Array.from(document.querySelectorAll(".threadloaf-message"));
        const targetMessage = messages[number - 1];
        if (targetMessage) {
            targetMessage.classList.add("highlighted");
            targetMessage.scrollIntoView({ behavior: "smooth", block: "center" });

            // Set up the fade out
            const timeoutId = setTimeout(() => {
                targetMessage.classList.add("fade-out");
                // Remove classes after fade animation completes
                setTimeout(() => {
                    targetMessage.classList.remove("highlighted");
                    targetMessage.classList.remove("fade-out");
                }, 300); // Match the CSS transition duration
            }, 3000);

            targetMessage.setAttribute("data-fade-timeout", timeoutId.toString());
        }
    }

    // Attach a MutationObserver to monitor DOM changes
    private setupMutationObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            // Check if any mutation added new messages
            const hasNewMessages = mutations.some((mutation) =>
                Array.from(mutation.addedNodes).some(
                    (node) =>
                        node instanceof HTMLElement &&
                        (node.matches('li[id^="chat-messages-"]') || node.querySelector('li[id^="chat-messages-"]')),
                ),
            );

            if (hasNewMessages) {
                const newThreadContainer = this.findThreadContainer();
                if (newThreadContainer && newThreadContainer !== this.threadContainer) {
                    this.threadContainer = newThreadContainer;
                    this.renderThread();
                }
            }
        });

        this.observer.observe(this.appContainer!, {
            childList: true,
            subtree: true,
        });
    }

    // Fallback: Polling to handle delayed loading or missed events
    private setupPolling(): void {
        let attempts = 0;
        const maxAttempts = 30; // Try for 30 seconds
        const interval = setInterval(() => {
            attempts++;
            const newThreadContainer = this.findThreadContainer();

            if (newThreadContainer && newThreadContainer !== this.threadContainer) {
                this.threadContainer = newThreadContainer;
                this.renderThread();
            }

            // Only stop polling if we've found messages or exceeded max attempts
            if ((newThreadContainer && newThreadContainer.children.length > 0) || attempts >= maxAttempts) {
                clearInterval(interval);
            }
        }, 1000);
    }

    // Inject CSS styles for the thread UI
    private injectStyles(): void {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = chrome.runtime.getURL("styles.css");
        document.head.appendChild(link);
    }

    private setupHeaderObserver(): void {
        // Initial attempt to hide header
        this.findAndHideHeader();

        // Keep watching for header changes
        this.headerObserver = new MutationObserver(() => {
            this.findAndHideHeader();
        });

        this.headerObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    private findAndHideHeader(): void {
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

    private setupKeyboardNavigation(): void {
        document.addEventListener(
            "keydown",
            (e) => {
                // Only handle A/Z if we have an expanded post
                const expandedPost = document.querySelector(".threadloaf-message.expanded");
                if (!expandedPost) return;

                // Don't handle navigation if we're typing in an input
                const activeElement = document.activeElement;
                if (
                    activeElement &&
                    (activeElement.tagName === "INPUT" ||
                        activeElement.tagName === "TEXTAREA" ||
                        activeElement.getAttribute("contenteditable") === "true")
                ) {
                    return;
                }

                if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "z") {
                    // Prevent the keypress from being handled by Discord
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // Keep focus on body to prevent Discord from focusing the text input
                    document.body.focus();

                    // Find all messages
                    const allMessages = Array.from(document.querySelectorAll(".threadloaf-message"));
                    const currentIndex = allMessages.indexOf(expandedPost as HTMLElement);

                    // Calculate target index
                    let targetIndex = currentIndex;
                    if (e.key.toLowerCase() === "a" && currentIndex > 0) {
                        targetIndex = currentIndex - 1;
                    } else if (e.key.toLowerCase() === "z" && currentIndex < allMessages.length - 1) {
                        targetIndex = currentIndex + 1;
                    }

                    if (targetIndex !== currentIndex) {
                        // Collapse current post
                        expandedPost.classList.remove("expanded");
                        const currentPreview = expandedPost.querySelector(".preview-container") as HTMLElement;
                        const currentFull = expandedPost.querySelector(".full-content") as HTMLElement;
                        if (currentPreview) currentPreview.style.display = "flex";
                        if (currentFull) currentFull.style.display = "none";

                        // Expand target post
                        const targetPost = allMessages[targetIndex] as HTMLElement;
                        targetPost.classList.add("expanded");
                        const targetPreview = targetPost.querySelector(".preview-container") as HTMLElement;
                        const targetFull = targetPost.querySelector(".full-content") as HTMLElement;
                        if (targetPreview) targetPreview.style.display = "none";
                        if (targetFull) targetFull.style.display = "block";

                        // Scroll target into view
                        targetPost.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
            },
            true,
        ); // Use capture phase to handle event before Discord
    }

    private updateFloatButtonPosition(): void {
        const floatButton = document.getElementById("threadloaf-float-button");
        const channelContainer = this.threadContainer?.closest('div[class*="chat_"]');

        if (floatButton && channelContainer) {
            const channelRect = channelContainer.getBoundingClientRect();
            const channelCenter = channelRect.left + channelRect.width / 2;

            // Position relative to channel container, let CSS handle the transform
            floatButton.style.left = `${channelCenter}px`;
        }
    }
}

// Initialize the Threadloaf class
new Threadloaf();