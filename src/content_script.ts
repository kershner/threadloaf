/// <reference path="./DomParser.ts" />
/// <reference path="./MessageInfo.ts" />
/// <reference path="./MessageParser.ts" />
/// <reference path="./MessageTreeBuilder.ts" />
/// <reference path="./ThreadloafState.ts" />
/// <reference path="./ThreadRenderer.ts" />
/// <reference path="./Threadloaf.ts" />

(function () {
    const state = new ThreadloafState();
    const messageParser = new MessageParser(state);
    const messageTreeBuilder = new MessageTreeBuilder();
    const domMutator = new DomMutator(state);
    const domParser = new DomParser(domMutator, state);
    const threadRenderer = new ThreadRenderer(state, domParser, domMutator, messageParser, messageTreeBuilder);
    new Threadloaf(state, domParser, domMutator, threadRenderer);
})();
