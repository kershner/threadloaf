// content_script.ts

interface MessageInfo {
  id: string;
  author: string;
  timestamp: number; // Unix timestamp in milliseconds
  content: string;
  htmlContent: string;
  parentId?: string; // Parent message ID (if reply)
  children?: MessageInfo[]; // List of child messages
}

class Threadweaver {
  private appContainer: HTMLElement | null = null;
  private threadContainer: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private headerObserver: MutationObserver | null = null;

  constructor() {
    console.log('Threadweaver: Initializing...');
    this.initialize();
  }

  // Entry point for initialization
  private initialize(): void {
    this.appContainer = this.findAppContainer();
    if (!this.appContainer) {
      console.error('Threadweaver: Failed to find app container. Aborting initialization.');
      return;
    }
    this.injectStyles();
    this.setupHeaderObserver();
    this.setupMutationObserver();
    this.setupPolling();
  }

  // Locate the top-level app container
  private findAppContainer(): HTMLElement | null {
    return document.querySelector('#app-mount');
  }

  // Locate the thread container dynamically
  private findThreadContainer(): HTMLElement | null {
    const elements = document.querySelectorAll<HTMLElement>('ol[class^="scrollerInner_"]');
    const threadContainer = Array.from(elements).find(el => {
      return el.getAttribute('data-list-id') === 'chat-messages' && el.children.length > 0;
    }) || null;
    
    if (threadContainer) {
      // Find and disable scrolling on the original scroller
      const scrollerElement = threadContainer.closest('div[class*="scroller_"]');
      if (scrollerElement) {
        const scrollerClass = Array.from(scrollerElement.classList)
          .find(className => className.startsWith('scroller_'));
        if (scrollerClass) {
          // Add the class to our styles to disable its scrolling
          this.addScrollerStyle(scrollerClass);
        }
      }
    }
    
    return threadContainer;
  }

  private addScrollerStyle(scrollerClass: string): void {
    const style = document.createElement('style');
    style.textContent = `
      div.${scrollerClass} {
        overflow-y: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Parse all messages in the thread container
  private parseMessages(): MessageInfo[] {
    if (!this.threadContainer) return [];

    const messages = Array.from(this.threadContainer.querySelectorAll('li[id^="chat-messages-"]')).map((el) => {
      const id = el.id.split('-').pop() || '';
      console.log(`Threadweaver: Processing message ${id}`);

      const contentsEl = el.querySelector('[class^="contents_"]');
      if (!contentsEl) {
        console.log('el', el);
        throw new Error('Failed to find contents element. Aborting message parsing.');
      }

      const headerEl = contentsEl.querySelector('[class^="header_"]');
      if (!headerEl) {
        console.log('contentsEl', contentsEl);
        throw new Error('Failed to find header element. Aborting message parsing.');
      }

      const author = headerEl.querySelector('[id^="message-username-"] > span[class^="username_"]')?.textContent?.trim();
      if (!author) {
        console.log('headerEl', headerEl);
        throw new Error('Failed to find author element. Aborting message parsing.');
      }

      const timestampEl = headerEl.querySelector('time');
      if (!timestampEl) {
        console.log('headerEl', headerEl);
        throw new Error('Failed to find timestamp element. Aborting message parsing.');
      }

      const dateTime = timestampEl.getAttribute('datetime');
      if (!dateTime) {
        console.log('timestampEl', timestampEl);
        throw new Error('Failed to find datetime attribute. Aborting message parsing.');
      }

      const timestamp = new Date(dateTime).getTime();

      const messageContentEl = contentsEl.querySelector('[id^="message-content-"]');
      if (!messageContentEl) {
        console.log('contentsEl', contentsEl);
        throw new Error('Failed to find message content element. Aborting message parsing.');
      }

      // Find accessories/embeds container
      const accessoriesId = `message-accessories-${id}`;
      const accessoriesEl = el.querySelector(`#${accessoriesId}`);
      console.log(`Threadweaver: Looking for accessories with ID ${accessoriesId}`, accessoriesEl);

      // Debug image detection in both content and accessories
      const contentImages = messageContentEl.querySelectorAll('img');
      const accessoryImages = accessoriesEl ? accessoriesEl.querySelectorAll('img') : [];
      const totalImages = contentImages.length + accessoryImages.length;
      
      console.log(`Threadweaver: Found ${totalImages} total images in message ${id}:`, {
        contentImages: contentImages.length,
        accessoryImages: accessoryImages.length
      });

      // Log details for all images
      [...contentImages, ...accessoryImages].forEach((img, idx) => {
        console.log(`Threadweaver: Image ${idx + 1}/${totalImages}:`, {
          src: img.src,
          'aria-label': img.getAttribute('aria-label'),
          class: img.className,
          width: img.width,
          height: img.height,
          container: img.closest('#' + accessoriesId) ? 'accessories' : 'content'
        });
      });

      // Get text content for preview, handling image-only messages
      let textContent = messageContentEl.textContent || '';
      if (!textContent) {
        if (totalImages > 0) {
          textContent = '🖼️ Image';
        } else if (accessoriesEl) {
          const links = accessoriesEl.querySelectorAll('a[href]');
          if (links.length > 0) {
            textContent = '🔗 Link';
          }
        }
        console.log(`Threadweaver: Message ${id} is media-only`);
      }

      // Clone both content and accessories
      const contentClone = messageContentEl.cloneNode(true) as HTMLElement;
      let fullContent = contentClone;

      if (accessoriesEl) {
        // Convert embeds to plain text links
        const links = Array.from(accessoriesEl.querySelectorAll<HTMLAnchorElement>('a[href]')).map(a => a.href);
        const images = Array.from(accessoriesEl.querySelectorAll<HTMLImageElement>('img[src]')).map(img => img.src);
        
        // Create a container for content and links
        const container = document.createElement('div');
        container.appendChild(contentClone);

        // Add all unique links
        const uniqueLinks = [...new Set([...links, ...images])];
        if (uniqueLinks.length > 0) {
          const linkList = document.createElement('div');
          linkList.classList.add('embed-links');
          
          uniqueLinks.forEach(url => {
            const link = document.createElement('a');
            link.href = url;
            // Truncate long URLs
            if (url.length > 70) {
              const start = url.slice(0, 35);
              const end = url.slice(-30);
              link.textContent = `${start}...${end}`;
              link.title = url; // Show full URL on hover
            } else {
              link.textContent = url;
            }
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            
            const linkContainer = document.createElement('div');
            linkContainer.appendChild(link);
            linkList.appendChild(linkContainer);
          });
          
          container.appendChild(linkList);
        }
        
        fullContent = container;
        console.log(`Threadweaver: Converted embeds to ${uniqueLinks.length} links for message ${id}`);
      }

      // Fix all image sources in the cloned content
      fullContent.querySelectorAll('img').forEach((img, idx) => {
        const originalSrc = img.src;
        if (img.src) {
          img.src = img.src; // Force a re-assignment to resolve any relative URLs
          console.log(`Threadweaver: Processed image ${idx + 1} src:`, {
            original: originalSrc,
            new: img.src
          });
        }
        if (img.getAttribute('aria-label')) {
          img.alt = img.getAttribute('aria-label') || '';
          console.log(`Threadweaver: Copied aria-label to alt:`, img.alt);
        }
      });

      // Debug the final HTML content
      console.log(`Threadweaver: Final HTML for message ${id}:`, fullContent.innerHTML);

      let parentId: string | undefined = undefined;
      const replyContextMaybe = el.querySelector('[id^="message-reply-context-"]');
      if (replyContextMaybe) {
        parentId = replyContextMaybe.querySelector('[id^="message-content-"]')?.id.split('-').pop() || '';
      }

      return { 
        id, 
        author, 
        timestamp, 
        content: textContent,
        htmlContent: fullContent.innerHTML,
        parentId, 
        children: [] 
      };
    });

    return messages;
  }

  // Build a hierarchical message tree
  private buildMessageTree(messages: MessageInfo[]): MessageInfo[] {
    const idToMessage = new Map<string, MessageInfo>();
    const rootMessages: MessageInfo[] = [];

    // Sort messages chronologically for processing
    const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    // Initialize all messages in the map
    for (const message of sortedMessages) {
      message.children = [];
      idToMessage.set(message.id, message);
    }

    // Track the last reply's parent for implied relationships
    let lastReplyParentId: string | undefined = undefined;
    let lastReplyTimestamp: number = 0;
    const ONE_MINUTE = 60 * 1000; // milliseconds

    // Build the tree by linking children to parents
    for (const message of sortedMessages) {
      let effectiveParentId = message.parentId;

      // If this message has no explicit parent, check for implied relationship
      if (!effectiveParentId && lastReplyParentId) {
        const timeSinceLastReply = message.timestamp - lastReplyTimestamp;
        if (timeSinceLastReply <= ONE_MINUTE) {
          // Within one minute of last reply, use the same parent
          effectiveParentId = lastReplyParentId;
          console.log(`Threadweaver: Implied parent relationship - Message ${message.id} -> Parent ${lastReplyParentId}`);
        }
      }

      // Update tracking of last reply
      if (message.parentId) {
        lastReplyParentId = message.parentId;
        lastReplyTimestamp = message.timestamp;
      }

      // Link message to its parent (explicit or implied)
      if (effectiveParentId) {
        const parent = idToMessage.get(effectiveParentId);
        if (parent) {
          parent.children?.push(message);
        } else {
          rootMessages.push(message); // Treat as root if parent not found
        }
      } else {
        rootMessages.push(message); // Root-level message
      }
    }

    return rootMessages;
  }

  // Render the thread UI
  private renderThread(): void {
    if (!this.threadContainer) return;

    const threadweaverContainer = document.createElement('div');
    threadweaverContainer.id = 'threadweaver-container';

    // Parse messages and build tree
    const rawMessages = this.parseMessages();
    
    // Sort messages chronologically for numbering and color grading
    const sortedMessages = [...rawMessages].sort((a, b) => a.timestamp - b.timestamp);
    const messageNumbers = new Map<string, number>();
    
    // Assign chronological numbers to messages
    sortedMessages.forEach((msg, index) => {
      messageNumbers.set(msg.id, index + 1);
    });
    
    // Sort for color grading (newest first)
    const colorSortedMessages = [...rawMessages].sort((a, b) => b.timestamp - a.timestamp);
    const messageColors = new Map<string, string>();
    const messageBold = new Map<string, boolean>();
    
    // Set colors for the newest 15 messages
    const baseGray = 128; // Medium gray
    const numGradientMessages = Math.min(15, colorSortedMessages.length);
    
    colorSortedMessages.forEach((msg, index) => {
      if (index === 0) {
        // Newest message gets white and bold
        messageColors.set(msg.id, 'rgb(255, 255, 255)');
        messageBold.set(msg.id, true);
      } else if (index < numGradientMessages) {
        // Next 14 messages get gradient from just above medium gray to near-white
        const colorValue = Math.floor(baseGray + ((255 - baseGray) * (numGradientMessages - index) / numGradientMessages));
        messageColors.set(msg.id, `rgb(${colorValue}, ${colorValue}, ${colorValue})`);
        messageBold.set(msg.id, false);
      } else {
        // Older messages get medium gray
        messageColors.set(msg.id, `rgb(${baseGray}, ${baseGray}, ${baseGray})`);
        messageBold.set(msg.id, false);
      }
    });

    const rootMessages = this.buildMessageTree(rawMessages);

    // Clear existing container and append new content
    threadweaverContainer.innerHTML = '';

    const renderMessages = (messages: MessageInfo[], depth = 0) => {
      for (const message of messages) {
        const el = this.createMessageElement(
          message, 
          depth, 
          messageColors.get(message.id) || '', 
          messageBold.get(message.id) || false,
          messageNumbers.get(message.id) || 0,
          messageNumbers.size
        );
        threadweaverContainer.appendChild(el);

        if (message.children) {
          renderMessages(message.children, depth + 1);
        }
      }
    };

    renderMessages(rootMessages);

    // Hide original thread container and append custom UI
    this.threadContainer.style.display = 'none';
    const parentElement = this.threadContainer.parentElement;
    if (parentElement) {
      parentElement.style.position = 'relative';
      parentElement.appendChild(threadweaverContainer);
    }

    // Try to hide header again after rendering
    this.findAndHideHeader();
  }

  // Create a message element
  private createMessageElement(
    message: MessageInfo, 
    depth: number, 
    color: string, 
    isBold: boolean,
    commentNumber: number,
    totalMessages: number
  ): HTMLElement {
    const el = document.createElement('div');
    el.classList.add('threadweaver-message');
    el.style.marginLeft = `${depth * 20}px`;
    
    // Preview container (always visible)
    const previewContainer = document.createElement('div');
    previewContainer.classList.add('preview-container');
    
    // Create number pill container
    const pillContainer = document.createElement('div');
    pillContainer.classList.add('pill-container');
    
    // Add navigation arrows
    const prevArrow = document.createElement('button');
    prevArrow.classList.add('nav-arrow', 'prev');
    prevArrow.textContent = '←';
    prevArrow.disabled = commentNumber === 1;
    prevArrow.onclick = (e) => {
      e.stopPropagation();
      this.highlightMessage(commentNumber - 1);
    };
    
    const nextArrow = document.createElement('button');
    nextArrow.classList.add('nav-arrow', 'next');
    nextArrow.textContent = '→';
    nextArrow.disabled = commentNumber === totalMessages;
    nextArrow.onclick = (e) => {
      e.stopPropagation();
      this.highlightMessage(commentNumber + 1);
    };
    
    // Add comment number pill
    const numberPill = document.createElement('span');
    numberPill.classList.add('comment-number');
    numberPill.textContent = commentNumber.toString();
    
    pillContainer.appendChild(prevArrow);
    pillContainer.appendChild(numberPill);
    pillContainer.appendChild(nextArrow);
    
    const contentPreview = document.createElement('span');
    contentPreview.classList.add('message-content', 'preview');
    contentPreview.textContent = message.content;
    contentPreview.style.color = color;
    if (isBold) {
      contentPreview.style.fontWeight = 'bold';
    }
    
    const separator = document.createElement('span');
    separator.classList.add('separator');
    separator.textContent = ' : ';
    
    const authorSpan = document.createElement('span');
    authorSpan.classList.add('message-author');
    authorSpan.textContent = message.author;
    
    previewContainer.appendChild(pillContainer);
    previewContainer.appendChild(contentPreview);
    previewContainer.appendChild(separator);
    previewContainer.appendChild(authorSpan);
    
    // Full content container (shown when expanded)
    const fullContentContainer = document.createElement('div');
    fullContentContainer.classList.add('full-content');

    // Add username header and reply button container
    const headerContainer = document.createElement('div');
    headerContainer.classList.add('expanded-header');
    
    const expandedAuthor = document.createElement('span');
    expandedAuthor.classList.add('expanded-author');
    expandedAuthor.textContent = message.author;
    
    const replyButton = document.createElement('button');
    replyButton.classList.add('reply-button');
    replyButton.textContent = 'Reply';
    replyButton.onclick = (e) => {
      e.stopPropagation(); // Prevent collapsing when clicking reply
    };
    
    headerContainer.appendChild(expandedAuthor);
    headerContainer.appendChild(replyButton);
    
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content-expanded');
    console.log(`Threadweaver: Setting innerHTML for message ${message.id}:`, message.htmlContent);
    messageContent.innerHTML = message.htmlContent;

    // Debug the rendered content
    const renderedImages = messageContent.querySelectorAll('img');
    console.log(`Threadweaver: Rendered ${renderedImages.length} images in message ${message.id}`);
    renderedImages.forEach((img, idx) => {
      console.log(`Threadweaver: Rendered image ${idx + 1}/${renderedImages.length}:`, {
        src: img.src,
        'aria-label': img.getAttribute('aria-label'),
        alt: img.alt,
        width: img.width,
        height: img.height,
        display: window.getComputedStyle(img).display
      });
    });

    fullContentContainer.appendChild(headerContainer);
    fullContentContainer.appendChild(messageContent);
    fullContentContainer.style.display = 'none';
    
    el.appendChild(previewContainer);
    el.appendChild(fullContentContainer);
    el.dataset.msgId = message.id;

    el.addEventListener('click', () => {
      const isExpanded = el.classList.toggle('expanded');
      previewContainer.style.display = isExpanded ? 'none' : 'flex';
      fullContentContainer.style.display = isExpanded ? 'block' : 'none';
    });

    return el;
  }

  private highlightMessage(number: number): void {
    // Remove any existing highlights and clear any pending fade timeouts
    document.querySelectorAll('.threadweaver-message.highlighted').forEach(el => {
      el.classList.remove('highlighted');
      el.classList.remove('fade-out');
      const timeoutId = el.getAttribute('data-fade-timeout');
      if (timeoutId) {
        clearTimeout(parseInt(timeoutId));
      }
    });

    // Find and highlight the target message
    const messages = document.querySelectorAll('.threadweaver-message');
    messages.forEach(msg => {
      const pillNumber = msg.querySelector('.comment-number')?.textContent;
      if (pillNumber === number.toString()) {
        msg.classList.add('highlighted');
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Set up the fade out
        const timeoutId = setTimeout(() => {
          msg.classList.add('fade-out');
          // Remove classes after fade animation completes
          setTimeout(() => {
            msg.classList.remove('highlighted');
            msg.classList.remove('fade-out');
          }, 300); // Match the CSS transition duration
        }, 3000);
        
        msg.setAttribute('data-fade-timeout', timeoutId.toString());
      }
    });
  }

  // Attach a MutationObserver to monitor DOM changes
  private setupMutationObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      // Check if any mutation added new messages
      const hasNewMessages = mutations.some(mutation => 
        Array.from(mutation.addedNodes).some(node => 
          node instanceof HTMLElement && 
          (node.matches('li[id^="chat-messages-"]') || node.querySelector('li[id^="chat-messages-"]'))
        )
      );

      if (hasNewMessages) {
        console.log('Threadweaver: Detected new messages.');
        const newThreadContainer = this.findThreadContainer();
        if (newThreadContainer && newThreadContainer !== this.threadContainer) {
          console.log('Threadweaver: Updating thread container with new messages.');
          this.threadContainer = newThreadContainer;
          this.renderThread();
        }
      }
    });

    this.observer.observe(this.appContainer!, {
      childList: true,
      subtree: true,
    });

    console.log('Threadweaver: MutationObserver attached.');
  }

  // Fallback: Polling to handle delayed loading or missed events
  private setupPolling(): void {
    let attempts = 0;
    const maxAttempts = 30; // Try for 30 seconds
    const interval = setInterval(() => {
      attempts++;
      const newThreadContainer = this.findThreadContainer();
      
      if (newThreadContainer && newThreadContainer !== this.threadContainer) {
        console.log('Threadweaver: Thread container with messages found via polling.');
        this.threadContainer = newThreadContainer;
        this.renderThread();
      }

      // Only stop polling if we've found messages or exceeded max attempts
      if ((newThreadContainer && newThreadContainer.children.length > 0) || attempts >= maxAttempts) {
        console.log('Threadweaver: Stopping polling - ' + 
          (attempts >= maxAttempts ? 'max attempts reached' : 'messages found'));
        clearInterval(interval);
      }
    }, 1000);
  }

  // Inject CSS styles for the thread UI
  private injectStyles(): void {
    const styles = `
      #threadweaver-container {
        padding: 16px;
        padding-bottom: 100px; /* Extra padding for the text input */
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #000000;
        color: #ffffff;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 16px;
        overflow-y: scroll;
        overflow-x: hidden;
        z-index: 0; /* Ensure we're below the text input */
      }

      /* Find the parent that contains our container and the text input */
      div[class*="chat_"] {
        position: relative !important;
        height: 100% !important;
      }

      #threadweaver-container::-webkit-scrollbar {
        width: 8px;
      }

      #threadweaver-container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }

      #threadweaver-container::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
      }

      #threadweaver-container::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.4);
      }

      .threadweaver-message {
        margin: 4px 0;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        max-width: 100%;
      }

      .preview-container {
        padding: 10px 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        line-height: 1.4;
      }

      .message-content.preview {
        overflow: hidden;
        text-overflow: ellipsis;
        min-height: 1.4em;
      }

      .expanded-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .expanded-author {
        color: #f3e7b5;
        font-weight: bold;
        font-size: 1.1em;
      }

      .reply-button {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #ffffff;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.2s ease;
      }

      .reply-button:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .message-content-expanded {
        padding: 16px 12px;
        white-space: normal;
        line-height: 1.4;
      }

      .message-content-expanded img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 4px 0;
        display: block;
      }

      .message-content.preview img {
        display: none;
      }

      .threadweaver-message:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .separator {
        color: #ffffff;
        flex-shrink: 0;
      }

      .message-author {
        color: #f3e7b5;
        flex-shrink: 0;
      }

      .comment-number {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.8em;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 24px;
        text-align: center;
        flex-shrink: 0;
        transition: opacity 0.2s ease;
      }

      .pill-container {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0;
      }

      .nav-arrow {
        position: absolute;
        opacity: 0;
        background: rgba(0, 0, 0, 0.8);
        border: none;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        padding: 2px 0;
        font-size: 0.9em;
        transition: all 0.2s ease;
        width: 16px;
        text-align: center;
        border-radius: 4px;
        z-index: 1;
      }

      .nav-arrow.prev {
        right: 75%;
        transform: translateX(50%);
      }

      .nav-arrow.next {
        left: 75%;
        transform: translateX(-50%);
      }

      .nav-arrow:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.9);
        color: white;
      }

      .nav-arrow:disabled {
        color: rgba(255, 255, 255, 0.3);
        background: rgba(0, 0, 0, 0.4);
        cursor: not-allowed;
      }

      .comment-number {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.4);
        font-size: 0.8em;
        padding: 2px 6px;
        border-radius: 10px;
        min-width: 24px;
        text-align: center;
        flex-shrink: 0;
        transition: opacity 0.2s ease;
      }

      .pill-container:hover .comment-number {
        opacity: 0;
      }

      .pill-container:hover .nav-arrow {
        opacity: 1;
      }

      .threadweaver-message.highlighted {
        background: rgba(255, 255, 255, 0.15);
        transition: background 0.2s ease;
      }

      .threadweaver-message.fade-out {
        background: rgba(255, 255, 255, 0.05);
        transition: background 0.3s ease;
      }

      /* Embed/accessories styles */
      [class*="container_b558d0"] {
        margin-top: 8px;
      }

      [class*="visualMediaItemContainer_"] {
        max-width: 100%;
        margin: 4px 0;
      }

      [class*="imageContent_"] img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        display: block;
      }

      [class*="imageWrapper_"] {
        max-width: 100% !important;
        width: auto !important;
      }

      [class*="clickableWrapper_"] {
        max-width: 100%;
      }

      [class*="loadingOverlay_"] {
        max-width: 100%;
      }

      [class*="loadingOverlay_"] img {
        max-width: 100% !important;
        height: auto !important;
        object-fit: contain !important;
      }

      /* Hide edit buttons and other UI elements we don't need */
      [class*="hoverButtonGroup_"] {
        display: none;
      }

      .embed-links {
        margin-top: 8px;
      }

      .embed-links div {
        margin: 4px 0;
      }

      .embed-links a {
        color: #5865F2;
        text-decoration: none;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: block;
        font-size: 0.9em;
      }

      .embed-links a:hover {
        text-decoration: underline;
      }
    `;

    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  private setupHeaderObserver(): void {
    // Initial attempt to hide header
    this.findAndHideHeader();

    // Keep watching for header changes
    this.headerObserver = new MutationObserver(() => {
      this.findAndHideHeader();
    });

    this.headerObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private findAndHideHeader(): void {
    const headers = document.querySelectorAll('div[class*=" "]');
    for (const header of Array.from(headers)) {
      const classes = Array.from(header.classList);
      const hasContainerClass = classes.some(cls => cls.startsWith('container_'));
      const hasHeaderClass = classes.some(cls => cls.startsWith('header_'));
      if (hasContainerClass && hasHeaderClass && header instanceof HTMLElement) {
        header.style.display = 'none';
        console.log('Threadweaver: Found and hid channel header');
        break;
      }
    }
  }
}

// Initialize the Threadweaver class
new Threadweaver();
