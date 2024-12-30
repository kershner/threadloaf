class ThreadloafState {
    public appContainer: HTMLElement | null = null;
    public threadContainer: HTMLElement | null = null;
    public observer: MutationObserver | null = null;
    public headerObserver: MutationObserver | null = null;
    public isThreadViewActive: boolean = false;
    public isTopLoaded: boolean = false;
    public isLoadingMore: boolean = false;
}
