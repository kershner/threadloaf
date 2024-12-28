# Message Threading Rules

This document describes the rules for coalescing consecutive messages and building a message tree structure. The goal is to create a natural conversation flow by combining related messages and establishing parent-child relationships.

## Overview

The process happens in two phases:
1. Coalescing consecutive messages from the same author
2. Building the message tree with explicit and implicit parent-child relationships

## Phase 1: Message Coalescing

Messages are coalesced (combined) when they meet ALL of the following criteria:

1. The messages are from the same author
2. The messages are within a 3-minute window of each other
3. Neither message is an explicit reply to another message
4. The earlier message hasn't already been coalesced into another message

### Coalescing Process

1. Sort all messages chronologically by timestamp
2. For each message (current message):
   - Skip if this message has already been coalesced into another message
   - If this message is NOT an explicit reply:
     - Look backwards through recent messages to find the most recent message that:
       - Is from the same author
       - Is within 3 minutes of the current message
       - Hasn't been coalesced into another message
     - If such a message is found:
       - Combine the current message into that message by:
         - Appending the current message's HTML content with a `<br>` separator
         - Appending the current message's text content with a space separator
         - Mark the current message as coalesced
         - Record which message it was coalesced into
     - If no such message is found:
       - Keep the current message as a standalone message

## Phase 2: Message Tree Building

After coalescing, build a tree structure using both explicit replies and implicit relationships.

### Rules for Finding a Parent

For each message in chronological order:

1. If the message has an explicit parent (is a reply):
   - Check if the parent message was coalesced into another message
   - If it was coalesced, use the coalesced message as the parent instead
   - If the parent message exists in our set:
     - Make this message a child of that parent
   - If the parent message doesn't exist and wasn't coalesced:
     - Create a ghost message to represent the missing parent
     - Make this message a child of the ghost message
   - If the parent message doesn't exist but was coalesced:
     - Make this message a root message

2. If the message has no explicit parent:
   - Look for the most recent message within 3 minutes
   - If found:
     - Make this message a child of that message
   - If not found:
     - Make this message a root message

### Ghost Messages

Ghost messages are created only when ALL of these conditions are met:
1. The message is an explicit reply to another message
2. The parent message is not found in our current set
3. The parent message was not coalesced into another message

Ghost messages contain:
- The parent message's ID
- Author information if available (from reply preview)
- Content preview if available (from reply preview)
- A timestamp 1ms before their child message
- An `isGhost` flag set to true

## Example Scenario

Consider this sequence of messages, all within 3 minutes:
```
A1: "Hello" (non-reply)
B1: "Hi" (non-reply)
A2: "How are you?" (non-reply)
B2: "Good thanks" (non-reply)
C1: "Me too" (explicit reply to B2)
```

The result will be:
```
A1+A2 (coalesced: "Hello\nHow are you?")
└── B1+B2 (coalesced: "Hi\nGood thanks", implicitly parented to A1+A2)
    └── C1 (explicitly parented to B1+B2 because B2 was coalesced into it)
```

## Implementation Notes

1. Always process messages in chronological order
2. Maintain a map of which messages were coalesced into which other messages
3. When coalescing, preserve the earlier message's ID as the combined message ID
4. Ghost messages should only be created as a last resort when we can't find the real parent or a coalesced version of it
5. The 3-minute window applies to both coalescing and implicit parenting 