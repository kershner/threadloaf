export interface MessageInfo {
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
