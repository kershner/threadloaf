import morph from "nanomorph";

/**
 * Helper class to manage DOM diffing and patching using nanomorph.
 * Provides a simple interface to efficiently update DOM elements by
 * only modifying what has changed.
 */
export class DomDiffer {
    private currentTree: HTMLElement | null = null;

    /**
     * Updates an existing DOM tree with a new one, using nanomorph to
     * efficiently patch only the differences.
     *
     * @param oldContainer The existing container element to update
     * @param newContent The new content to morph the old container into
     * @returns The morphed container element
     */
    public morphTree(oldContainer: HTMLElement, newContent: HTMLElement): HTMLElement {
        // If this is our first render, just return the new content
        if (!this.currentTree) {
            this.currentTree = newContent;
            return newContent;
        }

        // Use nanomorph to efficiently update only what changed
        const morphedTree = morph(oldContainer, newContent);
        this.currentTree = morphedTree;
        return morphedTree;
    }

    /**
     * Clears the current tree reference.
     * Call this when completely removing the tree from DOM.
     */
    public clearTree() {
        this.currentTree = null;
    }
}
