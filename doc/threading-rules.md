# Message Threading Rules

This document describes the rules for building a message tree structure. The goal is to create a natural conversation flow by establishing parent-child relationships between messages.

## Core Rules

1. **Explicit Replies**: If a message is an explicit reply (using Discord's reply feature), that relationship is always honored without evaluating any other rules.

2. **Same Author Within 3 Minutes**: If a message is not an explicit reply, look at the immediately preceding message. If that message is:
   - Within 3 minutes
   - From the same author
   Then treat the new message as having the same parent as the preceding message. This allows users to write multi-line messages that all become children of the same parent.

Any message that doesn't match these rules (i.e., a non-reply message from a different author) will be parented to the root of the conversation.

## Example Scenarios

### Scenario 1: Multi-line message from same author
```
A1: "Hello" (reply to X)
A2: "How are you?" (within 3min of A1)
A3: "I have a question" (within 3min of A2)
```
Result:
```
X
├── A1 (reply to X)
├── A2 (same parent as A1)
└── A3 (same parent as A1)
```

### Scenario 2: Back-and-forth conversation with no explicit replies
```
A1: "Hello"
B1: "Hi" (within 3min of A1)
A2: "How are you?" (within 3min of B1)
B2: "Good thanks" (within 3min of A2)
```
Result:
```
ROOT
├── A1
├── B1
├── A2
└── B2
```

### Scenario 3: Mixed explicit and implicit replies
```
A1: "Hello"
B1: [explicit reply to A1] "Hi"
A2: "How are you?" (within 3min of B1)
C1: [explicit reply to A1] "Hey there"
```
Result:
```
ROOT
├── A1
│   ├── B1 (explicit reply)
│   └── C1 (explicit reply)
└── A2 (no explicit reply, different author than B1)
``` 