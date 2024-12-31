import { deepEqual, Test, IGNORE } from "./test_utils";
import { MessageInfo } from "./MessageInfo";
import { MessageParser } from "./MessageParser";

export class MessageParserTest {
    private parser: MessageParser;

    constructor() {
        this.parser = new MessageParser();
    }

    private async loadTestFile(filePath: string): Promise<HTMLElement> {
        const extensionUrl = chrome.runtime.getURL(`test-data/${filePath}`);
        const response = await fetch(extensionUrl);
        const html = await response.text();
        const container = document.createElement("div");
        container.innerHTML = html;
        return container.firstChild as HTMLElement;
    }

    async getTests(): Promise<Test[]> {
        return [
            {
                name: "parse cozy-non-reply.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-non-reply.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse compact-non-reply.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-non-reply.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-reactions.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-reactions.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div><div class="reactions_ec6b19 largeReactions_ec6b19" role="group" id="message-reactions-1323564429408997426"><div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="sparkling heart, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="💖" src="https://discord.com/assets/257ec62e14d4c1c89808.svg" alt="💖" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="point up 2, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="👆" src="https://discord.com/assets/db1a06e4b01639c96019.svg" alt="👆" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="saluting face, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="🫡" src="https://discord.com/assets/6aae4f996e21c1d6fd73.svg" alt="🫡" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div aria-label="Add Reaction"></div></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse compact-reactions.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-reactions.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div><div class="reactions_ec6b19 largeReactions_ec6b19" role="group" id="message-reactions-1323564429408997426"><div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="sparkling heart, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="💖" src="https://discord.com/assets/257ec62e14d4c1c89808.svg" alt="💖" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="point up 2, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="👆" src="https://discord.com/assets/db1a06e4b01639c96019.svg" alt="👆" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div><div class="reaction_ec6b19 reactionMe_ec6b19" style="opacity: 1;"><div class="reactionInner_ec6b19" aria-expanded="false" aria-disabled="false" aria-label="saluting face, 1 reaction, press to remove your reaction" aria-pressed="true" role="button" tabindex="0"><div class=""></div><div><img class="emoji reactionLarge" data-type="emoji" data-name="🫡" src="https://discord.com/assets/6aae4f996e21c1d6fd73.svg" alt="🫡" draggable="false"></div><div class="reactionCount_ec6b19" style="min-width: 9px;">1</div></div></div></div><div aria-label="Add Reaction"></div></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-parent-and-child.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-parent-and-child.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                        {
                            id: "1323577271814197381",
                            author: "electroly",
                            timestamp: 1735635812477,
                            content: "foobar",
                            htmlContent:
                                '<div id="message-content-1323577271814197381" class="markup_f8f345 messageContent_f9f2ca"><span>foobar</span></div>',
                            parentId: "1323564429408997426",
                            parentPreview: {
                                author: "electroly",
                                content: "<span>asdf</span>",
                            },
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse compact-parent-and-child.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-parent-and-child.html")), [
                        {
                            id: "1323564429408997426",
                            author: "electroly",
                            timestamp: 1735632750609,
                            content: "asdf",
                            htmlContent:
                                '<div id="message-content-1323564429408997426" class="markup_f8f345 messageContent_f9f2ca"><span>asdf</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                        {
                            id: "1323577271814197381",
                            author: "electroly",
                            timestamp: 1735635812477,
                            content: "foobar",
                            htmlContent:
                                '<div id="message-content-1323577271814197381" class="markup_f8f345 messageContent_f9f2ca"><span>foobar</span></div>',
                            parentId: "1323564429408997426",
                            parentPreview: {
                                author: "electroly",
                                content: "<span>asdf</span>",
                            },
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-op.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-op.html")), [
                        {
                            id: "1323584268588285952",
                            author: "electroly",
                            timestamp: 1735637480638,
                            content: "test message",
                            htmlContent:
                                '<div id="message-content-1323584268588285952" class="markup_f8f345 messageContent_f9f2ca"><span>test message</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse compact-op.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-op.html")), [
                        {
                            id: "1323584268588285952",
                            author: "electroly",
                            timestamp: 1735637480638,
                            content: "test message",
                            htmlContent:
                                '<div id="message-content-1323584268588285952" class="markup_f8f345 messageContent_f9f2ca"><span>test message</span></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-change-post-title.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-change-post-title.html")), [
                        {
                            id: "1323585208091676832",
                            author: "System",
                            timestamp: 1735637704633,
                            content: "electroly changed the post title: test thread! — Today at 9:35 AM",
                            htmlContent:
                                '<div class="channelNameChange_ce613b container_d76df7 cozy_d76df7"><div class="iconContainer_d76df7"><div data-accessibility="desaturate" class="icon_d76df7 iconSize_d76df7" style="background-image: url(&quot;/assets/6a41d3db4f37899d1306.svg&quot;);"></div></div><div class="content_d76df7"><a class="anchor_af404b anchorUnderlineOnHover_af404b" aria-expanded="false" role="button" tabindex="0" style="color: rgb(233, 30, 99);"><span class="username_de3235 desaturateUserColors_c7819f" style="color: rgb(233, 30, 99);">electroly</span></a> changed the post title: <strong>test thread!</strong><span class="timestamp_f9f2ca timestampInline_f9f2ca"><time aria-label="Today at 9:35 AM" datetime="2024-12-31T09:35:04.633Z"><i class="separator_f9f2ca" aria-hidden="true"> — </i>Today at 9:35 AM</time></span></div></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse compact-change-post-title.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-change-post-title.html")), [
                        {
                            id: "1323585208091676832",
                            author: "System",
                            timestamp: 1735637704633,
                            content: "electroly changed the post title: test thread! — Today at 9:35 AM",
                            htmlContent:
                                '<div class="channelNameChange_ce613b container_d76df7 compact_d76df7"><div class="iconContainer_d76df7"><div data-accessibility="desaturate" class="icon_d76df7 iconSize_d76df7" style="background-image: url(&quot;/assets/6a41d3db4f37899d1306.svg&quot;);"></div></div><div class="content_d76df7"><a class="anchor_af404b anchorUnderlineOnHover_af404b" aria-expanded="false" role="button" tabindex="0" style="color: rgb(233, 30, 99);"><span class="username_de3235 desaturateUserColors_c7819f" style="color: rgb(233, 30, 99);">electroly</span></a> changed the post title: <strong>test thread!</strong><span class="timestamp_f9f2ca timestampInline_f9f2ca"><time aria-label="Today at 9:35 AM" datetime="2024-12-31T09:35:04.633Z"><i class="separator_f9f2ca" aria-hidden="true"> — </i>Today at 9:35 AM</time></span></div></div>',
                            children: [],
                            originalElement: IGNORE,
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-server-boost.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-server-boost.html")), [
                        {
                            id: "1323590100294303754",
                            author: "System",
                            timestamp: 1735638871025,
                            content:
                                "electroly just boosted the server! Cool Server has achieved Level 3! — Today at 9:54 AM",
                            htmlContent:
                                '<div class="container_d76df7 cozy_d76df7"><div class="iconContainer_d76df7"><div class="iconWrapper_f1b373" role="button" tabindex="0"><svg class="icon_f1b373" aria-hidden="true" role="img" width="24" height="24" viewBox="0 0 8 12"><path d="M4 0L0 4V8L4 12L8 8V4L4 0ZM7 7.59L4 10.59L1 7.59V4.41L4 1.41L7 4.41V7.59Z" fill="currentColor"></path><path d="M2 4.83V7.17L4 9.17L6 7.17V4.83L4 2.83L2 4.83Z" fill="currentColor"></path></svg></div></div><div class="content_d76df7"><div class="message_f1b373"><a class="anchor_af404b anchorUnderlineOnHover_af404b" aria-expanded="false" role="button" tabindex="0"><span class="username_de3235 desaturateUserColors_c7819f">electroly</span></a> just boosted the server! Cool Server has achieved <strong>Level 3!</strong></div><span class="timestamp_f9f2ca timestampInline_f9f2ca"><time aria-label="Today at 9:54 AM" datetime="2024-12-31T09:54:31.025Z"><i class="separator_f9f2ca" aria-hidden="true"> — </i>Today at 9:54 AM</time></span></div></div>',
                            children: [],
                            originalElement: {},
                        },
                    ]);
                },
            },
            {
                name: "parse compact-server-boost.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-server-boost.html")), [
                        {
                            id: "1323590100294303754",
                            author: "System",
                            timestamp: 1735638871025,
                            content:
                                "electroly just boosted the server! Cool Server has achieved Level 3! — Today at 9:54 AM",
                            htmlContent:
                                '<div class="container_d76df7 compact_d76df7"><div class="iconContainer_d76df7"><div class="iconWrapper_f1b373" role="button" tabindex="0"><svg class="icon_f1b373" aria-hidden="true" role="img" width="24" height="24" viewBox="0 0 8 12"><path d="M4 0L0 4V8L4 12L8 8V4L4 0ZM7 7.59L4 10.59L1 7.59V4.41L4 1.41L7 4.41V7.59Z" fill="currentColor"></path><path d="M2 4.83V7.17L4 9.17L6 7.17V4.83L4 2.83L2 4.83Z" fill="currentColor"></path></svg></div></div><div class="content_d76df7"><div class="message_f1b373"><a class="anchor_af404b anchorUnderlineOnHover_af404b" aria-expanded="false" role="button" tabindex="0"><span class="username_de3235 desaturateUserColors_c7819f">electroly</span></a> just boosted the server! Cool Server has achieved <strong>Level 3!</strong></div><span class="timestamp_f9f2ca timestampInline_f9f2ca"><time aria-label="Today at 9:54 AM" datetime="2024-12-31T09:54:31.025Z"><i class="separator_f9f2ca" aria-hidden="true"> — </i>Today at 9:54 AM</time></span></div></div>',
                            children: [],
                            originalElement: {},
                        },
                    ]);
                },
            },
            {
                name: "parse cozy-automod.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("cozy-automod.html")), [
                        {
                            //TODO
                        },
                    ]);
                },
            },
            {
                name: "parse compact-automod.html",
                fn: async () => {
                    deepEqual(this.parser.parseMessages(await this.loadTestFile("compact-automod.html")), [
                        {
                            //TODO
                        },
                    ]);
                },
            },
        ];
    }
}
