import { ThreadloafState } from "./ThreadloafState";
import { DomParser } from "./DomParser";
import { DomMutator } from "./DomMutator";
import { MessageParser } from "./MessageParser";
import { MessageTreeBuilder } from "./MessageTreeBuilder";
import { MessageInfo } from "./MessageInfo";

/**
 * Manages the rendering of threaded message views in the Discord interface.
 * Responsible for creating and updating the thread UI, handling message
 * expansion/collapse, managing the load more button, and coordinating
 * between the message tree structure and DOM representation.
 */
export class ThreadRenderer {
    private state: ThreadloafState;
    private domParser: DomParser;
    private domMutator: DomMutator;
    private messageParser: MessageParser;
    private messageTreeBuilder: MessageTreeBuilder;

    constructor(
        state: ThreadloafState,
        domParser: DomParser,
        domMutator: DomMutator,
        messageParser: MessageParser,
        messageTreeBuilder: MessageTreeBuilder,
    ) {
        this.state = state;
        this.domParser = domParser;
        this.domMutator = domMutator;
        this.messageParser = messageParser;
        this.messageTreeBuilder = messageTreeBuilder;
    }

    // Render the thread UI
    public renderThread(): void {
        if (!this.state.threadContainer) return;

        // Store scroll position before re-render
        const existingThreadContent = document.getElementById("threadloaf-content");

        // Store currently expanded message and its position relative to viewport
        const expandedMessage = document.querySelector(".threadloaf-message.expanded");
        const expandedMessageId = expandedMessage?.getAttribute("data-msg-id");
        const expandedMessageRect = expandedMessage?.getBoundingClientRect();
        const expandedMessageViewportOffset = expandedMessageRect ? expandedMessageRect.top : null;

        // If no expanded message, store position of most recent non-expanded message
        let recentMessageId: string | null = null;
        let recentMessageViewportOffset: number | null = null;
        if (!expandedMessage && existingThreadContent) {
            const allMessages = Array.from(existingThreadContent.querySelectorAll(".threadloaf-message"));
            const mostRecentMessage = allMessages[allMessages.length - 1] as HTMLElement;
            if (mostRecentMessage) {
                recentMessageId = mostRecentMessage.getAttribute("data-msg-id");
                const rect = mostRecentMessage.getBoundingClientRect();
                recentMessageViewportOffset = rect.top;
            }
        }

        // Check if we're at the top of the thread
        this.state.isTopLoaded = this.domParser.checkIfTopLoaded();

        // Get existing container or create new one
        let threadloafContainer = document.getElementById("threadloaf-container");
        const isNewContainer = !threadloafContainer;

        if (isNewContainer) {
            threadloafContainer = document.createElement("div");
            threadloafContainer.id = "threadloaf-container";
        }

        // Create a new container for thread content
        const threadContent = document.createElement("div");
        threadContent.id = "threadloaf-content";

        // Build the new DOM tree
        const newThreadloafContainer = document.createElement("div");
        newThreadloafContainer.id = "threadloaf-container";
        newThreadloafContainer.appendChild(threadContent);

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
            loadUpButton.style.marginRight = "8px"; // Change margin to right side

            // Create Newest button
            const newestButton = this.createNewestButton();
            newestButton.style.marginLeft = "8px";

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
                    // Scroll to newest message
                    this.scrollToNewestMessage();
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
            floatButton.appendChild(loadUpButton); // Move load button to start
            floatButton.appendChild(toggleContainer);
            floatButton.appendChild(newestButton); // Add newest button at the end
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
        const rawMessages = this.messageParser.parseMessages(this.state.threadContainer);

        // Build the tree (which includes coalescing)
        const rootMessages = this.messageTreeBuilder.buildMessageTree(rawMessages);

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

        const numGradientMessages = Math.min(15, colorSortedMessages.length);

        // Store the newest message ID if we have messages
        if (colorSortedMessages.length > 0) {
            this.state.newestMessageId = colorSortedMessages[0].id;
        }

        colorSortedMessages.forEach((msg, index) => {
            let color;
            if (index === 0) {
                // Newest message gets text-normal color and bold
                color = "var(--text-normal)";
                messageColors.set(msg.id, color);
                messageBold.set(msg.id, true);
            } else if (index < numGradientMessages) {
                // Next messages get a gradient blend between text-normal and background-primary
                const ratio = Math.min(50, Math.round((index / numGradientMessages) * 100));
                color = `color-mix(in oklab, var(--text-normal), var(--background-primary) ${ratio}%)`;
                messageColors.set(msg.id, color);
                messageBold.set(msg.id, false);
            } else {
                // Older messages get 50% blend
                color = "color-mix(in oklab, var(--text-normal), var(--background-primary) 50%)";
                messageColors.set(msg.id, color);
                messageBold.set(msg.id, false);
            }
        });

        // Clear only the thread content
        threadContent.innerHTML = "";

        const renderMessages = (messages: MessageInfo[], depth = 0) => {
            // Calculate incremental indents
            const MAX_INDENT = 350;
            const FIRST_LEVEL_INDENT = 40;
            const DECAY_RATE = -Math.log(1 - FIRST_LEVEL_INDENT / MAX_INDENT);
            const MAX_THREADLINE_DEPTH = 10;

            const getIncrementalIndent = (level: number): number => {
                const totalIndentPrev =
                    level === 0 ? 0 : Math.round(MAX_INDENT * (1 - Math.exp(-DECAY_RATE * (level - 1))));
                const totalIndentCurr = Math.round(MAX_INDENT * (1 - Math.exp(-DECAY_RATE * level)));
                return totalIndentCurr - totalIndentPrev;
            };

            const createMessageWithChildren = (message: MessageInfo, currentDepth: number): HTMLElement => {
                const messageContainer = document.createElement("div");
                messageContainer.classList.add("message-container");

                const messageEl = this.domMutator.createMessageElement(
                    message,
                    0,
                    messageColors.get(message.id) || "",
                    messageBold.get(message.id) || false,
                    message.messageNumber || 0,
                    allMessages.length,
                );

                // Add class for root posts
                if (currentDepth === 0) {
                    messageEl.classList.add("root-thread");
                }

                // Add class if depth exceeds maxThreadlineDepth
                if (currentDepth > MAX_THREADLINE_DEPTH) {
                    messageEl.classList.add("no-threadline");
                }

                // Append the message element
                messageContainer.appendChild(messageEl);

                // Create children container if the message has children
                if (message.children && message.children.length > 0) {
                    const childrenContainer = document.createElement("div");
                    childrenContainer.classList.add("children-container");

                    if (currentDepth + 1 > MAX_THREADLINE_DEPTH) {
                        childrenContainer.classList.add("no-threadline");
                    }

                    childrenContainer.style.marginLeft = `${getIncrementalIndent(currentDepth + 1)}px`;

                    message.children.forEach((child) => {
                        const childElement = createMessageWithChildren(child, currentDepth + 1);
                        childrenContainer.appendChild(childElement);
                    });

                    messageContainer.appendChild(childrenContainer);
                }

                return messageContainer;
            };

            const container = document.createElement("div");
            container.classList.add("message-thread");

            messages.forEach((message) => {
                const rootMessageElement = createMessageWithChildren(message, depth);
                container.appendChild(rootMessageElement);
            });

            return container;
        };

        threadContent.appendChild(renderMessages(rootMessages));

        // Hide original thread container and append/update custom UI
        if (this.state.isThreadViewActive) {
            this.state.threadContainer.style.display = "none";
            const parentElement = this.state.threadContainer.parentElement;
            if (parentElement) {
                parentElement.style.position = "relative";

                if (isNewContainer) {
                    // First render - just append the new container
                    parentElement.appendChild(newThreadloafContainer);
                } else {
                    threadloafContainer!.replaceWith(newThreadloafContainer);
                }

                // First, handle expanded posts
                if (expandedMessageId) {
                    // Restore previously expanded message
                    const messageToExpand = document.querySelector(
                        `[data-msg-id="${expandedMessageId}"]`,
                    ) as HTMLElement;
                    if (messageToExpand) {
                        messageToExpand.classList.add("expanded");
                        const previewContainer = messageToExpand.querySelector(".preview-container") as HTMLElement;
                        const fullContentContainer = messageToExpand.querySelector(".full-content") as HTMLElement;
                        if (previewContainer) previewContainer.style.display = "none";
                        if (fullContentContainer) fullContentContainer.style.display = "block";

                        // Restore expanded message's position relative to viewport
                        if (expandedMessageViewportOffset !== null) {
                            const newRect = messageToExpand.getBoundingClientRect();
                            const currentOffset = newRect.top;
                            const scrollContainer = document.getElementById("threadloaf-content");
                            if (scrollContainer) {
                                scrollContainer.scrollTop += currentOffset - expandedMessageViewportOffset;
                            }
                        }
                    }
                } else if (recentMessageId && recentMessageViewportOffset !== null) {
                    // Restore position of most recent message
                    const recentMessage = document.querySelector(`[data-msg-id="${recentMessageId}"]`) as HTMLElement;
                    if (recentMessage) {
                        const newRect = recentMessage.getBoundingClientRect();
                        const currentOffset = newRect.top;
                        const scrollContainer = document.getElementById("threadloaf-content");
                        if (scrollContainer) {
                            scrollContainer.scrollTop += currentOffset - recentMessageViewportOffset;
                        }
                    }
                } else if (!existingThreadContent) {
                    // Scroll to newest message on initial render without expanding it
                    setTimeout(() => {
                        this.scrollToNewestMessage(false);
                    }, 0);
                }

                // Check if we have a pending scroll to newest
                setTimeout(() => {
                    if (this.state.pendingScrollToNewest !== null) {
                        this.scrollToNewestMessage(this.state.pendingScrollToNewest.shouldExpand);
                    }
                }, 0);
            }
        } else {
            this.state.threadContainer.style.display = "block";
            // Remove any existing threadloaf container
            const existingContainer = document.getElementById("threadloaf-container");
            if (existingContainer) {
                existingContainer.remove();
            }
        }

        // Try to hide header again after rendering
        this.domMutator.findAndHideHeader();
    }

    private createLoadUpButton(): HTMLButtonElement {
        const loadUpButton = document.createElement("button");
        loadUpButton.className = "load-up-button";
        loadUpButton.textContent = "🠉";
        loadUpButton.title = "Load earlier messages";
        loadUpButton.disabled = this.state.isTopLoaded;

        let isLoading = false;
        loadUpButton.onclick = async () => {
            if (isLoading) return;

            const scrollerElement = this.state.threadContainer?.closest('div[class*="scroller_"]');
            if (!scrollerElement) return;

            isLoading = true;
            this.state.isLoadingMore = true; // Set flag before loading
            loadUpButton.disabled = this.state.isTopLoaded;

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
            }

            // Re-enable after a delay
            setTimeout(() => {
                isLoading = false;
                this.state.isLoadingMore = false;
                loadUpButton.disabled = this.state.isTopLoaded || false;
            }, 1000);
        };

        return loadUpButton;
    }

    private createNewestButton(): HTMLButtonElement {
        const newestButton = document.createElement("button");
        newestButton.className = "newest-button";
        newestButton.textContent = "🠋";
        newestButton.title = "Jump to newest message";

        newestButton.onclick = () => {
            if (this.state.isThreadViewActive) {
                // In Thread mode:
                // 1. Collapse any expanded message
                const expandedMessage = document.querySelector(".threadloaf-message.expanded");
                if (expandedMessage) {
                    expandedMessage.classList.remove("expanded");
                    const previewContainer = expandedMessage.querySelector(".preview-container") as HTMLElement;
                    const fullContent = expandedMessage.querySelector(".full-content") as HTMLElement;
                    if (previewContainer) previewContainer.style.display = "flex";
                    if (fullContent) fullContent.style.display = "none";
                }

                // 2. Scroll to newest message and expand it
                this.scrollToNewestMessage(true);
            } else {
                // In Chat mode: scroll the original chat container to bottom
                if (this.state.threadContainer) {
                    const scrollerElement = this.state.threadContainer.closest('div[class*="scroller_"]');
                    if (scrollerElement) {
                        scrollerElement.scrollTop = scrollerElement.scrollHeight;
                    }
                }
            }
        };

        return newestButton;
    }

    private updateFloatButtonPosition(): void {
        const floatButton = document.getElementById("threadloaf-float-button");
        const channelContainer = this.state.threadContainer?.closest('div[class*="chat_"]');

        if (floatButton && channelContainer) {
            const channelRect = channelContainer.getBoundingClientRect();
            const channelCenter = channelRect.left + channelRect.width / 2;
            floatButton.style.left = `${channelCenter}px`;
        }
    }

    private scrollToNewestMessage(shouldExpand: boolean = false): void {
        if (!this.state.newestMessageId) return;

        // Find the newest message by its ID
        const newestMessage = document.querySelector(
            `.threadloaf-message[data-msg-id="${this.state.newestMessageId}"]`,
        ) as HTMLElement;

        if (newestMessage) {
            if (shouldExpand) {
                // Expand the newest message
                newestMessage.classList.add("expanded");
                const previewContainer = newestMessage.querySelector(".preview-container") as HTMLElement;
                const fullContent = newestMessage.querySelector(".full-content") as HTMLElement;
                if (previewContainer) previewContainer.style.display = "none";
                if (fullContent) fullContent.style.display = "block";
            }

            // Scroll to show it (without animation)
            newestMessage.scrollIntoView({ behavior: "auto", block: "center" });
            // Clear any pending scroll
            this.state.pendingScrollToNewest = null;
        } else {
            // Message not found, set flag to try again later
            this.state.pendingScrollToNewest = { shouldExpand };
        }
    }
}
