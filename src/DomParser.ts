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
}
