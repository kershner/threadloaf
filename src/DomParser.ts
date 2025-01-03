import { DomMutator } from "./DomMutator";
import { ThreadloafState } from "./ThreadloafState";
import { DebouncedMutationObserver } from "./DebouncedMutationObserver";

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

/**
 * Handles DOM traversal and element discovery in Discord's interface.
 * Responsible for finding key UI elements, setting up mutation observers
 * to track DOM changes, and providing methods to locate message containers
 * and other important Discord UI components.
 */
export class DomParser {
    private domMutator: DomMutator;
    private state: ThreadloafState;

    constructor(domMutator: DomMutator, state: ThreadloafState) {
        this.domMutator = domMutator;
        this.state = state;
    }

    // Locate the top-level app container
    public findAppContainer(): HTMLElement | null {
        return document.querySelector("#app-mount");
    }

    // Locate the thread container dynamically
    public findThreadContainer(): HTMLElement | null {
        const elements = document.querySelectorAll<HTMLElement>('ol[class^="scrollerInner_"]');
        const threadContainer =
            Array.from(elements).find((el) => {
                return el.getAttribute("data-list-id") === "chat-messages" && el.children.length > 0;
            }) || null;

        if (threadContainer && this.state.isThreadViewActive) {
            // Only apply scroll override in thread view
            // Find and disable scrolling on the original scroller
            const scrollerElement = threadContainer.closest('div[class*="scroller_"]');
            if (scrollerElement) {
                const scrollerClass = Array.from(scrollerElement.classList).find((className) =>
                    className.startsWith("scroller_"),
                );
                if (scrollerClass) {
                    // Add the class to our styles to disable its scrolling
                    this.domMutator.addScrollerStyle(scrollerClass);
                }
            }
        }

        return threadContainer;
    }

    // Attach a MutationObserver to monitor DOM changes
    public setupMutationObserver(renderThread: () => void): void {
        this.state.observer = new DebouncedMutationObserver(
            (mutations) => {
                let shouldRerender = false;

                for (const mutation of mutations) {
                    // Check for new messages
                    const hasNewMessages = Array.from(mutation.addedNodes).some(
                        (node) =>
                            node instanceof HTMLElement &&
                            (node.matches('li[id^="chat-messages-"]') ||
                                node.querySelector('li[id^="chat-messages-"]')),
                    );

                    // Check for reactions changes - handle both cozy and compact modes
                    const hasReactionChanges = (() => {
                        if (!(mutation.target instanceof HTMLElement)) {
                            return false;
                        }

                        // First find the containing message li element
                        const messageLi = mutation.target.closest('li[id^="chat-messages-"]');
                        if (!messageLi) {
                            return false;
                        }

                        // Check if the mutation affects a reactions container anywhere within this message
                        return !!messageLi.querySelector('[class*="reactions_"]');
                    })();

                    // Check for message content edits
                    const hasMessageEdits =
                        (mutation.target instanceof HTMLElement &&
                            mutation.target.matches('[id^="message-content-"]')) ||
                        (mutation.target instanceof HTMLElement && mutation.target.closest('[id^="message-content-"]'));

                    if (hasNewMessages || hasReactionChanges || hasMessageEdits) {
                        shouldRerender = true;
                        break;
                    }
                }

                if (shouldRerender) {
                    const newThreadContainer = this.findThreadContainer();
                    if (newThreadContainer) {
                        this.state.threadContainer = newThreadContainer;
                        renderThread();
                    }
                }
            },
            {
                childList: true,
                subtree: true,
                characterData: true, // Needed for text content changes
                attributes: true, // Needed for reaction changes
            },
        );

        this.state.observer.observe(this.state.appContainer!);
    }

    public checkIfTopLoaded(): boolean {
        if (!this.state.threadContainer) {
            return false;
        }

        // Check if there's a container div with a heading-xxl/extrabold class as a direct child
        const topContainer = Array.from(this.state.threadContainer.children).find((child) => {
            if (!(child instanceof HTMLElement)) {
                return false;
            }

            const hasContainerClass = Array.from(child.classList).some((cls) => cls.startsWith("container_"));
            if (!hasContainerClass) {
                return false;
            }

            const hasHeading = Array.from(child.children).some((grandChild) => {
                if (!(grandChild instanceof HTMLElement)) {
                    return false;
                }

                const isHeading =
                    grandChild.tagName === "H3" &&
                    Array.from(grandChild.classList).some(
                        (cls) => cls.startsWith("heading-xxl") || cls.startsWith("extrabold"),
                    );

                return isHeading;
            });

            return hasHeading;
        });

        const result = !!topContainer;
        return result;
    }
}
