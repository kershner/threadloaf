/// <reference path="./DomMutator.ts" />
/// <reference path="./ThreadloafState.ts" />

class DomParser {
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
                const newThreadContainer = this.findThreadContainer();
                if (newThreadContainer) {
                    this.state.threadContainer = newThreadContainer;
                    renderThread();

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
}
