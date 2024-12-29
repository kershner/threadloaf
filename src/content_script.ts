// content_script.ts

/*
 * IMPORTANT: Discord Class/ID Naming Pattern
 *
 * Discord dynamically generates unique suffixes for all classes and IDs.
 * - Classes use underscores: "foo_[random]"  (e.g., "container_c2668b", "scroller_e2e187")
 * - IDs use hyphens: "bar-[random]"  (e.g., "message-content-123456", "chat-messages-789")
 *
 * NEVER do exact matches like:
 *   element.classList.contains("container_")  // WRONG
 *   document.getElementById("message-content") // WRONG
 *
 * ALWAYS use pattern matching:
 *   element.classList.some(cls => cls.startsWith("container_"))  // Correct
 *   document.querySelector('[id^="message-content-"]')  // Correct
 */

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
    originalElement?: HTMLElement; // Reference to the original Discord message element
    isError?: boolean; // Whether this is an error message
}

class Threadloaf {
    private appContainer: HTMLElement | null = null;
    private threadContainer: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private headerObserver: MutationObserver | null = null;
    private isThreadViewActive: boolean = false; // Changed from true to false to start in chat view
    private isTopLoaded: boolean = false;
    private isLoadingMore: boolean = false; // Add flag to track load more state

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
            try {
                const id = el.id.split("-").pop() || "";

                const contentsEl = el.querySelector('[class^="contents_"]');
                if (!contentsEl) {
                    throw new Error("Failed to find contents element");
                }

                // Try to parse as a system message first
                const systemContainer = contentsEl.querySelector('[class*="container_"][class*="compact_"]');
                if (systemContainer) {
                    // This is a system message (like boosts, joins, etc)
                    const messageContent =
                        systemContainer.querySelector('[class*="content_"]')?.textContent?.trim() || "";
                    const timestampEl = systemContainer.querySelector("time");
                    if (!timestampEl) {
                        throw new Error("Failed to find timestamp in system message");
                    }

                    const dateTime = timestampEl.getAttribute("datetime");
                    if (!dateTime) {
                        throw new Error("Failed to find datetime attribute in system message");
                    }

                    const timestamp = new Date(dateTime).getTime();

                    // For system messages, we'll use "System" as the author
                    return {
                        id,
                        author: "System",
                        timestamp,
                        content: messageContent,
                        htmlContent: systemContainer.outerHTML,
                        children: [],
                        originalElement: el as HTMLElement,
                    };
                }

                // If not a system message, proceed with regular message parsing
                const headerEl = contentsEl.querySelector('[class^="header_"]');
                if (!headerEl) {
                    throw new Error("Failed to find header element");
                }

                const author = headerEl
                    .querySelector('[id^="message-username-"] > span[class^="username_"]')
                    ?.textContent?.trim();
                if (!author) {
                    throw new Error("Failed to find author element");
                }

                const timestampEl = headerEl.querySelector("time");
                if (!timestampEl) {
                    throw new Error("Failed to find timestamp element");
                }

                const dateTime = timestampEl.getAttribute("datetime");
                if (!dateTime) {
                    throw new Error("Failed to find datetime attribute");
                }

                const timestamp = new Date(dateTime).getTime();

                const messageContentEl = contentsEl.querySelector('[id^="message-content-"]');
                if (!messageContentEl) {
                    throw new Error("Failed to find message content element");
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
                                (img instanceof HTMLImageElement ? img.alt : "") ||
                                img.getAttribute("aria-label") ||
                                "",
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
                        accessoriesEl.querySelectorAll<HTMLAnchorElement>(
                            'a[href]:not([class*="reaction"]):not([class*="originalLink_"]):not(article *)',
                        ),
                    ).map((a) => a.href);

                    // Handle image wrappers specially
                    const imageWrappers = Array.from(
                        accessoriesEl.querySelectorAll('div[class*="imageWrapper_"]:not(article *)'),
                    );
                    const imageLinks = imageWrappers
                        .map((wrapper) => {
                            const link = wrapper.querySelector('a[class*="originalLink_"]');
                            return link instanceof HTMLAnchorElement ? link.href : null;
                        })
                        .filter((url): url is string => url !== null);

                    // Handle regular images (not in wrappers)
                    const standaloneImages = Array.from(
                        accessoriesEl.querySelectorAll<HTMLImageElement>(
                            'img[src]:not([data-type="emoji"]):not(.lazyImg_)',
                        ),
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
                    const uniqueLinks = [...new Set([...links, ...imageLinks])];
                    if (uniqueLinks.length > 0) {
                        const linkList = document.createElement("div");
                        linkList.classList.add("embed-links");

                        uniqueLinks.forEach((url) => {
                            const link = document.createElement("a");
                            link.href = url;
                            // Add indicator based on URL pattern
                            let prefix = "🔗";
                            if (imageLinks.includes(url)) {
                                prefix = "🖼️";
                            }
                            // Truncate long URLs
                            if (url.length > 70) {
                                const start = url.slice(0, 35);
                                const end = url.slice(-30);
                                link.textContent = `${prefix}\u00A0${start}...${end}`;
                                link.title = url; // Show full URL on hover
                            } else {
                                link.textContent = `${prefix}\u00A0${url}`;
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
                    originalElement: el as HTMLElement,
                };
            } catch (error) {
                console.error("Error parsing message:", error);
                // Create an error message that shows what went wrong
                const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
                return {
                    id: el.id.split("-").pop() || "",
                    author: "Error",
                    timestamp: Date.now(), // Use current time for error messages
                    content: `Failed to parse message: ${errorMessage}`,
                    htmlContent: `<div class="error-message">Failed to parse message: ${errorMessage}</div>`,
                    children: [],
                    originalElement: el as HTMLElement,
                    isError: true, // Mark this as an error message
                };
            }
        });

        // Filter out any null messages and sort by timestamp
        return messages.filter((msg) => msg !== null).sort((a, b) => a.timestamp - b.timestamp);
    }

    // Build a hierarchical message tree
    private buildMessageTree(messages: MessageInfo[]): MessageInfo[] {
        // Sort messages chronologically for processing
        const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);
        const THREE_MINUTES = 3 * 60 * 1000; // milliseconds

        // Initialize message map and root messages array
        const idToMessage = new Map<string, MessageInfo>();
        const rootMessages: MessageInfo[] = [];

        // First pass: Initialize all messages in the map
        for (const message of sortedMessages) {
            message.children = [];
            idToMessage.set(message.id, message);
        }

        // Second pass: Build the tree
        for (let i = 0; i < sortedMessages.length; i++) {
            const message = sortedMessages[i];
            const previousMessage = i > 0 ? sortedMessages[i - 1] : null;

            // Rule 1: Honor explicit replies
            if (message.parentId) {
                const parent = idToMessage.get(message.parentId);
                if (parent) {
                    parent.children?.push(message);
                } else {
                    // Create ghost message for missing parent
                    /*
                     * IMPORTANT: Discord messages are ALWAYS rich HTML content that must be rendered properly.
                     * Never display raw HTML to users. The content and htmlContent fields contain Discord's
                     * rich message HTML which includes formatted text, emojis, images, and other rich content.
                     *
                     * When creating a ghost message:
                     * - content: Used for generating the preview text (will be parsed to extract plain text)
                     * - htmlContent: Used for the expanded view (must be rendered as HTML)
                     *
                     * Both fields should contain the same HTML from the parent preview to ensure consistent
                     * rendering in both preview and expanded states.
                     */
                    const ghostMessage: MessageInfo = {
                        id: message.parentId,
                        author: message.parentPreview?.author || "Unknown",
                        timestamp: message.timestamp - 1,
                        content: message.parentPreview?.content || "Message not loaded",
                        htmlContent: message.parentPreview?.content || "Message not loaded",
                        children: [message],
                        isGhost: true,
                    };
                    idToMessage.set(message.parentId, ghostMessage);
                    rootMessages.push(ghostMessage);
                }
                continue;
            }

            // For non-explicit replies, check previous message
            if (previousMessage && message.timestamp - previousMessage.timestamp <= THREE_MINUTES) {
                if (message.author === previousMessage.author) {
                    // Rule 2: Same author within 3 minutes - use same parent as previous message
                    if (previousMessage.parentId) {
                        const parent = idToMessage.get(previousMessage.parentId);
                        if (parent) {
                            parent.children?.push(message);
                            message.parentId = previousMessage.parentId;
                            continue;
                        }
                    } else {
                        // If previous message is a root message, this one should be too
                        rootMessages.push(message);
                        continue;
                    }
                } else {
                    // Rule 3: Different author within 3 minutes - treat as reply to previous message
                    previousMessage.children?.push(message);
                    message.parentId = previousMessage.id;
                    continue;
                }
            }

            // If no rules applied, this is a root message
            rootMessages.push(message);
        }

        return rootMessages;
    }

    // Render the thread UI
    private renderThread(): void {
        if (!this.threadContainer) return;

        // Check if we're at the top of the thread
        this.isTopLoaded = this.checkIfTopLoaded();

        // Store currently expanded message ID before re-render
        const expandedMessage = document.querySelector(".threadloaf-message.expanded");
        const expandedMessageId = expandedMessage?.getAttribute("data-msg-id");

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

            // Create Load Up button as a separate element
            const loadUpButton = this.createLoadUpButton();
            loadUpButton.style.marginLeft = "8px"; // Change margin to left side

            // Create toggle container
            const toggleContainer = document.createElement("div");
            toggleContainer.className = "toggle-container";

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

            // Append buttons in the right order
            toggleContainer.appendChild(chatOption);
            toggleContainer.appendChild(threadOption);
            floatButton.appendChild(toggleContainer);
            floatButton.appendChild(loadUpButton); // Move load button to end
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
        createFloatButton(this.isThreadViewActive);

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

                // Expand the first post when entering thread view
                const firstMessage = document.querySelector(".threadloaf-message") as HTMLElement;
                if (firstMessage) {
                    firstMessage.classList.add("expanded");
                    const previewContainer = firstMessage.querySelector(".preview-container") as HTMLElement;
                    const fullContentContainer = firstMessage.querySelector(".full-content") as HTMLElement;
                    if (previewContainer) previewContainer.style.display = "none";
                    if (fullContentContainer) fullContentContainer.style.display = "block";
                }
            }
        } else {
            this.threadContainer.style.display = "block";
            // Remove any existing threadloaf container
            const existingContainer = document.getElementById("threadloaf-container");
            if (existingContainer) {
                existingContainer.remove();
            }
        }

        // Restore expanded state if applicable
        if (expandedMessageId) {
            const messageToExpand = document.querySelector(`[data-msg-id="${expandedMessageId}"]`) as HTMLElement;
            if (messageToExpand) {
                messageToExpand.classList.add("expanded");
                const previewContainer = messageToExpand.querySelector(".preview-container") as HTMLElement;
                const fullContentContainer = messageToExpand.querySelector(".full-content") as HTMLElement;
                if (previewContainer) previewContainer.style.display = "none";
                if (fullContentContainer) fullContentContainer.style.display = "block";
                messageToExpand.scrollIntoView({ behavior: "auto", block: "nearest" });
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
        if (message.isError) {
            el.dataset.isError = "true";
        }
        el.style.width = "100%";

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
            /*
             * IMPORTANT: Ghost message preview handling
             *
             * Ghost messages contain Discord's rich HTML content from the parent preview.
             * We must parse this HTML properly to extract plain text for the preview.
             *
             * 1. Create a temporary container and set its HTML content
             * 2. Extract and normalize the text content
             * 3. Never display raw HTML in the preview
             *
             * This ensures consistent handling with regular messages while maintaining
             * proper text extraction from HTML content.
             */
            const temp = document.createElement("div");
            temp.innerHTML = message.content; // Parse the HTML safely
            contentPreview.textContent = temp.textContent?.replace(/\s+/g, " ").trim() || "Message not loaded";
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
            console.log("Actions button clicked");

            if (!message.originalElement) {
                console.error("No original element reference found for message");
                return;
            }
            console.log("Found original message:", message.originalElement);

            // Try to trigger context menu on each ancestor until one responds
            let currentElement: Element | null = message.originalElement.querySelector('[id^="message-content-"]');
            if (!currentElement) {
                console.error("Message content element not found in:", message.originalElement);
                return;
            }
            console.log("Starting from content element:", currentElement);

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

            while (currentElement && currentElement !== message.originalElement.parentElement) {
                console.log("Trying context menu on element:", currentElement);
                const contextEvent = new MouseEvent("contextmenu", {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 2,
                    buttons: 2,
                });

                const wasHandled = !currentElement.dispatchEvent(contextEvent);
                console.log("Context menu event was handled:", wasHandled);

                if (wasHandled) {
                    console.log("Context menu event was handled by element:", currentElement);
                    break;
                }
                currentElement = currentElement.parentElement;
                console.log("Moving to parent element:", currentElement);
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

            // Create a ghost content wrapper
            const ghostContent = document.createElement("div");
            ghostContent.classList.add("ghost-content");

            // Move the message content into the ghost content wrapper
            // This preserves the HTML rendering while applying ghost styling
            const existingContent = messageContent.innerHTML;
            messageContent.innerHTML = "";
            ghostContent.innerHTML = existingContent;

            messageContent.appendChild(ghostContent);
            messageContent.appendChild(ghostNotice);
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
            let shouldRerender = false;

            for (const mutation of mutations) {
                // Check for new messages
                const hasNewMessages = Array.from(mutation.addedNodes).some(
                    (node) =>
                        node instanceof HTMLElement &&
                        (node.matches('li[id^="chat-messages-"]') || node.querySelector('li[id^="chat-messages-"]')),
                );

                // Check for reactions changes
                const hasReactionChanges =
                    (mutation.target instanceof HTMLElement && mutation.target.matches('[class*="reactions_"]')) ||
                    (mutation.target instanceof HTMLElement && mutation.target.closest('[class*="reactions_"]'));

                // Check for message content edits
                const hasMessageEdits =
                    (mutation.target instanceof HTMLElement && mutation.target.matches('[id^="message-content-"]')) ||
                    (mutation.target instanceof HTMLElement && mutation.target.closest('[id^="message-content-"]'));

                if (hasNewMessages || hasReactionChanges || hasMessageEdits) {
                    shouldRerender = true;
                    break;
                }
            }

            if (shouldRerender) {
                const newThreadContainer = this.findThreadContainer();
                if (newThreadContainer) {
                    this.threadContainer = newThreadContainer;
                    this.renderThread();

                    // Only scroll to bottom if we're in thread view AND we're not loading more messages
                    if (this.isThreadViewActive && !this.isLoadingMore) {
                        const threadContent = document.getElementById("threadloaf-content");
                        if (threadContent) {
                            threadContent.scrollTop = threadContent.scrollHeight;
                        }
                    }
                }
            }
        });

        this.observer.observe(this.appContainer!, {
            childList: true,
            subtree: true,
            characterData: true, // Needed for text content changes
            attributes: true, // Needed for reaction changes
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

            // Position the container so the toggle is centered
            const toggleContainer = floatButton.querySelector(".toggle-container") as HTMLElement;
            if (toggleContainer) {
                const toggleWidth = toggleContainer.offsetWidth;
                const loadButton = floatButton.querySelector(".load-up-button") as HTMLElement;
                const loadButtonWidth = loadButton ? loadButton.offsetWidth : 0;
                const spacing = 8; // Space between buttons

                // Calculate position that centers the toggle and puts load button to the right
                const adjustedCenter = channelCenter + (loadButton ? (loadButtonWidth + spacing) / 2 : 0);

                floatButton.style.left = `${adjustedCenter}px`;
            } else {
                floatButton.style.left = `${channelCenter}px`;
            }
        }
    }

    private checkIfTopLoaded(): boolean {
        if (!this.threadContainer) {
            console.log("checkIfTopLoaded: No thread container found");
            return false;
        }

        console.log("checkIfTopLoaded: Checking children of thread container:", this.threadContainer.children);

        // Check if there's a container div with a heading-xxl/extrabold class as a direct child
        const topContainer = Array.from(this.threadContainer.children).find((child) => {
            if (!(child instanceof HTMLElement)) {
                console.log("checkIfTopLoaded: Child is not an HTMLElement:", child);
                return false;
            }

            console.log("checkIfTopLoaded: Checking child classes:", child.classList);
            const hasContainerClass = Array.from(child.classList).some((cls) => cls.startsWith("container_"));
            if (!hasContainerClass) {
                console.log("checkIfTopLoaded: Child doesn't have container_ class:", child);
                return false;
            }

            console.log("checkIfTopLoaded: Found container, checking for heading:", child.children);
            const hasHeading = Array.from(child.children).some((grandChild) => {
                if (!(grandChild instanceof HTMLElement)) {
                    console.log("checkIfTopLoaded: Grandchild is not an HTMLElement:", grandChild);
                    return false;
                }

                console.log("checkIfTopLoaded: Checking grandchild:", {
                    tagName: grandChild.tagName,
                    classList: grandChild.classList,
                });

                const isHeading =
                    grandChild.tagName === "H3" &&
                    Array.from(grandChild.classList).some(
                        (cls) => cls.startsWith("heading-xxl") || cls.startsWith("extrabold"),
                    );

                if (isHeading) {
                    console.log("checkIfTopLoaded: Found heading with required classes");
                }
                return isHeading;
            });

            return hasHeading;
        });

        const result = !!topContainer;
        console.log("checkIfTopLoaded: Final result:", result);
        return result;
    }

    private createLoadUpButton(): HTMLButtonElement {
        const loadUpButton = document.createElement("button");
        loadUpButton.className = "load-up-button";
        loadUpButton.textContent = "Load More";
        loadUpButton.title = "Load earlier messages";
        loadUpButton.style.opacity = this.isTopLoaded ? "0" : "1";
        loadUpButton.style.visibility = this.isTopLoaded ? "hidden" : "visible";

        let isLoading = false;
        loadUpButton.onclick = async () => {
            if (isLoading) return;

            const scrollerElement = this.threadContainer?.closest('div[class*="scroller_"]');
            if (!scrollerElement) return;

            isLoading = true;
            this.isLoadingMore = true; // Set flag before loading
            loadUpButton.disabled = true;

            // If we're in thread view, temporarily switch to chat view
            const wasInThreadView = this.isThreadViewActive;
            if (wasInThreadView) {
                // Switch to chat view
                this.threadContainer!.style.display = "block";
                const threadloafContainer = document.getElementById("threadloaf-container");
                if (threadloafContainer) {
                    threadloafContainer.remove();
                }
                // Remove our scroll override
                const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                    className.startsWith("scroller_"),
                );
                if (scrollerClass) {
                    this.removeScrollerStyle(scrollerClass);
                }
            }

            // Scroll and dispatch event
            scrollerElement.scrollTo({ top: 0 });
            const scrollEvent = new Event("scroll", {
                bubbles: true,
                cancelable: true,
            });
            scrollerElement.dispatchEvent(scrollEvent);

            // Wait a bit for the load to happen
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Switch back to thread view if we were in it
            if (wasInThreadView) {
                this.isThreadViewActive = true;
                this.renderThread();

                // After rendering, scroll to top of thread view
                const threadContent = document.getElementById("threadloaf-content");
                if (threadContent) {
                    threadContent.scrollTop = 0;
                }
            }

            // Re-enable after a delay
            setTimeout(() => {
                isLoading = false;
                this.isLoadingMore = false;
                loadUpButton.disabled = false;

                // Check if we're at the top after loading
                this.isTopLoaded = this.checkIfTopLoaded();
                loadUpButton.style.opacity = this.isTopLoaded ? "0" : "1";
                loadUpButton.style.visibility = this.isTopLoaded ? "hidden" : "visible";
            }, 1000);
        };

        return loadUpButton;
    }
}

// Initialize the Threadloaf class
new Threadloaf();
