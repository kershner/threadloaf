/// <reference path="./DomParser.ts" />
/// <reference path="./MessageInfo.ts" />
/// <reference path="./MessageParser.ts" />
/// <reference path="./ThreadloafState.ts" />

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

class Threadloaf {
    private state: ThreadloafState;
    private messageParser: MessageParser;
    private domParser: DomParser;
    private domMutator: DomMutator;

    constructor(state: ThreadloafState, messageParser: MessageParser, domParser: DomParser, domMutator: DomMutator) {
        this.state = state;
        this.messageParser = messageParser;
        this.domParser = domParser;
        this.domMutator = domMutator;
        this.initialize();
    }

    // Entry point for initialization
    private initialize(): void {
        this.state.appContainer = this.domParser.findAppContainer();
        if (!this.state.appContainer) {
            console.error("Threadloaf: Failed to find app container. Aborting initialization.");
            return;
        }
        this.injectStyles();
        this.setupHeaderObserver();
        this.setupMutationObserver();
        this.setupPolling();
        this.setupKeyboardNavigation();

        // Find initial thread container and set up initial view
        const initialThreadContainer = this.domParser.findThreadContainer();
        if (initialThreadContainer) {
            this.state.threadContainer = initialThreadContainer;
            // Show the chat view and create float button
            this.state.threadContainer.style.display = "block";
            this.renderThread(); // This will create the button in chat view mode
        }
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
        if (!this.state.threadContainer) return;

        // Check if we're at the top of the thread
        this.state.isTopLoaded = this.checkIfTopLoaded();

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

                this.state.isThreadViewActive = newIsThreadView; // Update the view state

                if (newIsThreadView) {
                    // Switch to thread view
                    if (this.state.threadContainer) {
                        this.state.threadContainer.style.display = "none";
                        // Re-add our scroll override
                        const scrollerElement = this.state.threadContainer.closest('div[class*="scroller_"]');
                        if (scrollerElement) {
                            const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                                className.startsWith("scroller_"),
                            );
                            if (scrollerClass) {
                                this.domMutator.addScrollerStyle(scrollerClass);
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
                    if (this.state.threadContainer) {
                        this.state.threadContainer.style.display = "block";
                        // Remove our scroll override
                        const scrollerElement = this.state.threadContainer.closest('div[class*="scroller_"]');
                        if (scrollerElement) {
                            const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                                className.startsWith("scroller_"),
                            );
                            if (scrollerClass) {
                                this.domMutator.removeScrollerStyle(scrollerClass);
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
            const channelContainer = this.state.threadContainer?.closest('div[class*="chat_"]');
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
        createFloatButton(this.state.isThreadViewActive);

        // Parse messages and build tree
        const rawMessages = this.messageParser.parseMessages();

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

                const messageEl = this.domMutator.createMessageElement(
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
        if (this.state.isThreadViewActive) {
            this.state.threadContainer.style.display = "none";
            const parentElement = this.state.threadContainer.parentElement;
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
            this.state.threadContainer.style.display = "block";
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

    // Attach a MutationObserver to monitor DOM changes
    private setupMutationObserver(): void {
        this.state.observer = new MutationObserver((mutations) => {
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
                const newThreadContainer = this.domParser.findThreadContainer();
                if (newThreadContainer) {
                    this.state.threadContainer = newThreadContainer;
                    this.renderThread();

                    // Only scroll to bottom if we're in thread view AND we're not loading more messages
                    if (this.state.isThreadViewActive && !this.state.isLoadingMore) {
                        const threadContent = document.getElementById("threadloaf-content");
                        if (threadContent) {
                            threadContent.scrollTop = threadContent.scrollHeight;
                        }
                    }
                }
            }
        });

        this.state.observer.observe(this.state.appContainer!, {
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
            const newThreadContainer = this.domParser.findThreadContainer();

            if (newThreadContainer && newThreadContainer !== this.state.threadContainer) {
                this.state.threadContainer = newThreadContainer;
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
        this.state.headerObserver = new MutationObserver(() => {
            this.findAndHideHeader();
        });

        this.state.headerObserver.observe(document.body, {
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
        const channelContainer = this.state.threadContainer?.closest('div[class*="chat_"]');

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
        if (!this.state.threadContainer) {
            console.log("checkIfTopLoaded: No thread container found");
            return false;
        }

        console.log("checkIfTopLoaded: Checking children of thread container:", this.state.threadContainer.children);

        // Check if there's a container div with a heading-xxl/extrabold class as a direct child
        const topContainer = Array.from(this.state.threadContainer.children).find((child) => {
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
        loadUpButton.style.opacity = this.state.isTopLoaded ? "0" : "1";
        loadUpButton.style.visibility = this.state.isTopLoaded ? "hidden" : "visible";

        let isLoading = false;
        loadUpButton.onclick = async () => {
            if (isLoading) return;

            const scrollerElement = this.state.threadContainer?.closest('div[class*="scroller_"]');
            if (!scrollerElement) return;

            isLoading = true;
            this.state.isLoadingMore = true; // Set flag before loading
            loadUpButton.disabled = true;

            // If we're in thread view, temporarily switch to chat view
            const wasInThreadView = this.state.isThreadViewActive;
            if (wasInThreadView) {
                // Switch to chat view
                this.state.threadContainer!.style.display = "block";
                const threadloafContainer = document.getElementById("threadloaf-container");
                if (threadloafContainer) {
                    threadloafContainer.remove();
                }
                // Remove our scroll override
                const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                    className.startsWith("scroller_"),
                );
                if (scrollerClass) {
                    this.domMutator.removeScrollerStyle(scrollerClass);
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
                this.state.isThreadViewActive = true;
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
                this.state.isLoadingMore = false;
                loadUpButton.disabled = false;

                // Check if we're at the top after loading
                this.state.isTopLoaded = this.checkIfTopLoaded();
                loadUpButton.style.opacity = this.state.isTopLoaded ? "0" : "1";
                loadUpButton.style.visibility = this.state.isTopLoaded ? "hidden" : "visible";
            }, 1000);
        };

        return loadUpButton;
    }
}

(function () {
    const state = new ThreadloafState();
    const messageParser = new MessageParser(state);
    const domMutator = new DomMutator(state);
    const domParser = new DomParser(domMutator, state);
    new Threadloaf(state, messageParser, domParser, domMutator);
})();
