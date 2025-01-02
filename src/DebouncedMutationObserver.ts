/**
 * A wrapper around MutationObserver that applies debouncing logic to mutation events.
 * This helps reduce performance impact when many DOM mutations occur in rapid succession.
 */
export class DebouncedMutationObserver {
    private observer: MutationObserver;
    private callback: MutationCallback;
    private options: MutationObserverInit;
    private target: Node | null = null;
    private debounceTimeoutId: number | null = null;
    private pendingMutations: MutationRecord[] = [];
    private readonly debounceMs: number;

    constructor(callback: MutationCallback, options: MutationObserverInit, debounceMs: number = 16) {
        this.callback = callback;
        this.options = options;
        this.debounceMs = debounceMs;

        // Create the underlying observer
        this.observer = new MutationObserver((mutations: MutationRecord[]) => {
            this.queueMutations(mutations);
        });
    }

    private queueMutations(mutations: MutationRecord[]): void {
        // Add new mutations to the queue
        this.pendingMutations.push(...mutations);

        // Clear existing timeout if any
        if (this.debounceTimeoutId !== null) {
            window.clearTimeout(this.debounceTimeoutId);
        }

        // Set new timeout
        this.debounceTimeoutId = window.setTimeout(() => {
            this.processPendingMutations();
        }, this.debounceMs);
    }

    private processPendingMutations(): void {
        if (this.pendingMutations.length > 0) {
            // Process all queued mutations at once
            this.callback(this.pendingMutations, this.observer);
            // Clear the queue
            this.pendingMutations = [];
        }
        this.debounceTimeoutId = null;
    }

    public observe(target: Node): void {
        this.target = target;
        this.observer.observe(target, this.options);
    }

    public disconnect(): void {
        this.observer.disconnect();
        this.target = null;
        this.pendingMutations = [];
        if (this.debounceTimeoutId !== null) {
            window.clearTimeout(this.debounceTimeoutId);
            this.debounceTimeoutId = null;
        }
    }

    public takeRecords(): MutationRecord[] {
        const records = [...this.pendingMutations, ...this.observer.takeRecords()];
        this.pendingMutations = [];
        if (this.debounceTimeoutId !== null) {
            window.clearTimeout(this.debounceTimeoutId);
            this.debounceTimeoutId = null;
        }
        return records;
    }
}
