import { DebouncedMutationObserver } from "./DebouncedMutationObserver";

/**
 * Manages the global state of the Threadloaf extension.
 * Maintains references to key DOM elements, observers, and UI state flags
 * that need to be accessed across different components of the extension.
 */
export class ThreadloafState {
    public appContainer: HTMLElement | null = null;
    public threadContainer: HTMLElement | null = null;
    public observer: DebouncedMutationObserver | null = null;
    public headerObserver: DebouncedMutationObserver | null = null;
    public isThreadViewActive: boolean = false;
    public isTopLoaded: boolean = false;
    public isLoadingMore: boolean = false;
    public newestMessageId: string | null = null;
    public pendingScrollToNewest: { shouldExpand: boolean } | null = null;
}
