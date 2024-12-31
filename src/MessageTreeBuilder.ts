import { MessageInfo } from "./MessageInfo";

/**
 * Constructs hierarchical message trees from flat message lists.
 * Responsible for analyzing message relationships (replies, parents),
 * building a tree structure that represents message threading,
 * and handling missing messages in the conversation chain.
 */
export class MessageTreeBuilder {
    // Build a hierarchical message tree
    public buildMessageTree(messages: MessageInfo[]): MessageInfo[] {
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
                    // Skip messages whose parents are not loaded
                    continue;
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
                }
            }

            // If no rules applied, this is a root message
            rootMessages.push(message);
        }

        return rootMessages;
    }
}
