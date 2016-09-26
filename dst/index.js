/// <reference path="../typings/index.d.ts" />

const {ipcRenderer, remote} = require('electron');
const {dialog} = remote;
const nodepath = require('path');
const _ = require('lodash');

const data = require('../fomatedtweets.json');

const separators = _.map(_.concat(
	['❤️', '♥︎', '💕', '♪', '！', '？', '、', '…', '。', '\\s', '笑', '」'],
	_.map(['o(^▽^)o', '⊂((・x・))⊃', '(OvO)', '(*^^*)', '＼(^o^)／', '(o^^o)', '(((o(*ﾟ▽ﾟ*)o)))', '(=ﾟωﾟ)ﾉ', '∑(ﾟДﾟ)', '(・ω・)', '( ；´Д｀)', '(Ｔ＿Ｔ)', '(*^o^*)', '( ´θ｀)ノ', '∧( \'Θ\' )∧', '((((；ﾟДﾟ)))))))', '( ´ ▽ ` )ﾉ', '*\\(^o^)/*', '|∀・)', '(^^)', '(*_*)', '\\(｀ω´ )/', '(♯｀∧´)', '(*^_^*)', '(　ﾟдﾟ)', 'Σ（ﾟдﾟlll', '( ^ω^ )', '>_<', '♪───Ｏ（≧∇≦）Ｏ────♪', '( *｀ω´)', '\\(｀ω´ )/'], (a) => a.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
), (a) => new RegExp(`(${a})[^${a}]+$|(${a})$`));

class MFile {

	/**
	 * For editor file class
	 * @param {String} path
	 * @param {Function} changeHandler
	 */
	constructor(path) {
		const ps = _.split(path, '/');
		const {length} = ps;
		const value = ipcRenderer.sendSync('read-file', { path });

		this.savedvalue = value;
		this.value = value;
		this.path = path;
		this.filename = ps[length - 1];
		this.dirname = ps[length - 2];
		this.markers = [];
	}

	/**
	 * Save file
	 */
	save() {
		ipcRenderer.sendSync('save-file', { path: this.path, data: this.value });
		this.savedvalue = this.value;
		this.changeMarker();
	}

	/**
	 * If the file is saved, the markers is hidden
	 */
	changeMarker() {
		_.forEach(this.markers, (a) => a.style.display = this.saved ? 'inline' : '');
	}

	get value() {
		return this.currentvalue;
	}

	get saved() {
		return this.savedvalue === this.value;
	}

	set value(value) {
		this.currentvalue = value;
		this.changeMarker();
	}
}

class Code {
	constructor() {
		const element = document.querySelector('.editor');
		const textarea = element.querySelector('textarea');
		textarea.addEventListener('keyup', this.keyupListener.bind(this));
		textarea.addEventListener('keydown', this.keydownListener.bind(this));
		const mirror = element.querySelector('.mirror');

		this.element = element;
		this.textarea = textarea;
		this.mirror = mirror;
		this.svalue = '';
		this.pvalue = '';
		this.notification = new Notification(this);
		this.list = new List(this);
		this.sidebar = new Sidebar(this);
		this.navbar = new Navbar(this);
		this.header = new Header(this);
		this.lastIndex = 0;
		this.caret = 0;
		this.files = {};
		this.path = null;

		ipcRenderer.on('menu-open', this.menuOpen.bind(this));
		ipcRenderer.on('menu-save', this.menuSave.bind(this));

		this.draw();
		this.hide();
		this.sidebar.hide();

		// For debug
		//const home = nodepath.join(__dirname, '../');
		//const {type, results, basename} = ipcRenderer.sendSync('open', { path: home });
		//this.sidebar.explorer.setWorkspace(basename, results);
		//this.openEditor(nodepath.join(home, 'test-files/tweet0.txt'));
	}

	/**
	 * When "Open" on menu, execute it. Open a file or directory from dialog.
	 * @param {Electron.IpcRendererEvent} event
	 * @param {any} args
	 */
	menuOpen(event, args) {
		const pathes = dialog.showOpenDialog({ properties: ['openFile', 'openDirectory'] });
		if (!pathes) { return; }
		const {type, results, basename} = ipcRenderer.sendSync('open', { path: pathes[0] });
		if (type === 'file') {
			this.openEditor(results[0]);
		} else if (type === 'directory') {
			this.sidebar.explorer.setWorkspace(basename, results);
		}
	}

	/**
	 * When "Save" on menu, execute it. Save the textarea value to file.
	 * @param {Electron.IpcRendererEvent} event
	 * @param {any} args
	 */
	menuSave(event, args) {
		this.files[this.path].save();
	}

	/**
	 * Open file on editor
	 * @param {String} path
	 */
	openEditor(path) {
		this.show();
		let file = this.files[path];
		if (!file) {
			file = new MFile(path);
			file.markers.push(this.header.circle);
			this.files[path] = file;
			this.sidebar.explorer.createOpenItem(file);
		}
		file.changeMarker();
		this.header.setFile(file);
		this.value = file.value;
		this.path = path;
	}

	/**
	 * Confirm to close the file. If ok, the file is closed.
	 * @param {String} path
	 */
	closeEditor(path) {
		const {editorTreeList} = this.sidebar.explorer;
		const current = editorTreeList.querySelector('.current');
		const file = this.files[path];

		if (!file.saved) {
			const result = ipcRenderer.sendSync('message-box-save-or-not', { filename: file.filename });
			if (result === 0) {
				file.save();
			} else if (result === 1) {
				return;
			}
		}

		delete this.files[path];
		current.remove();

		const first = editorTreeList.firstChild;
		if (first) {
			first.classList.add('current');
			this.openEditor(first.dataset.path);
		} else {
			this.hide();
		}
	}

	/**
	 * The element is shown
	 */
	show() {
		this.element.style.visibility = '';
	}

	/**
	 * The element is hidden
	 */
	hide() {
		this.element.style.visibility = 'hidden';
	}

	/**
	 * Main loop
	 */
	draw() {
		this.fit();
		this.sidebar.explorer.fit();
		this.sidebar.twitter.fit();
		requestAnimationFrame(this.draw.bind(this));
	}

	fit() {
		this.element.style.width = `${window.innerWidth - _.sumBy([
			this.navbar.element,
			this.sidebar.element
		], (a) => a.getBoundingClientRect().width)}px`;
	}

	/**
	 * Update caret (not visual).
	 */
	updateCaret() {
		this.caret = this.textarea.selectionStart;
	}

	/**
	 * Keydonw listener. Insert a value. Control List.
	 */
	keydownListener() {
		const {keyCode} = event;
		this.updateCaret();
		if (this.list.visible) {
			if (keyCode === 13 || keyCode === 9) {
				event.preventDefault();
				this.insert(this.list.value, this.lastIndex, this.caret);
			} else if (keyCode === 38) {
				event.preventDefault();
				this.list.increment(-1);
			} else if (keyCode === 40) {
				event.preventDefault();
				this.list.increment(1);
			} else if (keyCode === 27) {
				event.preventDefault();
				this.list.hide();
			}
		} else if (keyCode === 9) {
			event.preventDefault();
			this.insert('\t', this.caret, this.caret);
		}
	}

	/**
	 * Keyup listener. Update List.
	 */
	keyupListener() {
		const {value} = this;
		const {keyCode} = event;
		if (this.pvalue === value) { return; }
		this.updateCaret();
		this.lastIndex = 0;
		const head = value.substring(0, this.caret);
		_.forEach(Code.SEPARATORS, (separator) => {
			const m = head.match(separator);
			if (!m) { return; }
			const i = (m[1] || m[2]).length + m.index;
			if (this.caret < i) { return; }
			this.lastIndex = _.max([i, this.lastIndex]);
		});
		this.list.update(_.trim(value.substring(this.lastIndex, this.caret)), this.getCaretVisual(value));

		this.files[this.path].value = value;
		this.pvalue = value;
	}

	/**
	 * Insert text to textarea on caret
	 * @param {String} text
	 * @param {Number} headIndex
	 * @param {Number} tailIndex
	 */
	insert(text, headIndex, tailIndex) {
		const {value} = this;
		const head = value.substring(0, headIndex);
		const tail = value.substring(tailIndex);
		this.value = `${head}${text}${tail}`;
		this.focus();
		this.textarea.selectionStart = this.textarea.selectionEnd = headIndex + text.length;
		this.list.hide();
	}

	/**
	 * Focus textarea
	 */
	focus() {
		this.textarea.focus();
	}

	/**
	 * Get caret rectangle
	 * @param {Number} caret
	 * @param {String} value
	 * @returns {{x: Number, y: Number, height: Number}}
	 */
	getCaretVisual(value) {
		const style = window.getComputedStyle(this.textarea);
		this.mirror.innerText = '';
		_.forEach(['box-sizing', 'font', 'padding', 'border', 'width'], (a) => this.mirror.style[a] = style[a]);
		_.forEach(value.substring(0, this.caret), (a, i) => {
			const span = document.createElement('span');
			span.innerText = a;
			this.mirror.appendChild(span);
		});
		const node = _.last(this.mirror.childNodes);
		if (!node) { return { x: 0, y: 0, height: 0 }; }
		const mrect = this.mirror.getBoundingClientRect();
		const nrect = node.getBoundingClientRect();
		const x = nrect.left - mrect.left;
		const y = nrect.top - mrect.top + nrect.height;
		const height = nrect.height;
		return { x, y, height };
	}

	get file() {
		return this.files[this.path];
	}

	get value() {
		return this.textarea.value;
	}

	set value(value) {
		this.textarea.value = value;
		this.svalue = value;
	}

	static get SEPARATORS() {
		return separators;
	}

	static get SCROLL_BAR_WIDTH() {
		return 12;
	}
}

class Notification {

	/**
	 * Notification on Code
	 * @param {Code} code
	 */
	constructor(code) {
		const element = document.querySelector('.notification');
		const button = element.querySelector('.nt-button');
		button.addEventListener('click', () => this.hide());

		this.code = code;
		this.element = element;
		this.type = element.querySelector('.nt-type');
		this.message = element.querySelector('.nt-message');
		this.button = button;

		this.hide();
	}

	/**
	 * Notify something on Code.
	 * @param {{type: String, message: String}} opts
	 */
	yo(opts) {
		this.type.innerText = opts.type || 'info';
		this.message.innerText = opts.message;
		this.show();
	}

	/**
	 * The element is hidden.
	 */
	hide() {
		this.element.classList.remove('display-block');
	}

	/**
	 * The element is shown.
	 */
	show() {
		this.element.classList.add('display-block');
	}
}

class List {
	/**
	 * 
	 * @param {Code} code
	 */
	constructor(code) {
		const element = code.element.querySelector('.list');

		this.element = element;
		this.index = 0;
		this.code = code;

		this.hide();
	}

	/**
	 * Select a item by click
	 */
	clickItem() {
		this.code.insert(event.target.innerText, this.code.lastIndex, this.code.caret);
	}

	/**
	 * @param {Number} delta
	 */
	increment(delta) {
		const nodes = this.element.childNodes;
		const {length} = nodes;
		nodes[this.index].classList.remove('current');
		this.index = (this.index += delta) === length ? 0 : this.index === -1 ? length - 1 : this.index;
		const current = nodes[this.index];
		current.classList.add('current');
		this.element.scrollTop = current.offsetTop;
	}

	hide() {
		this.element.style.display = 'none';
		this.element.innerText = '';
		this.index = 0;
	}

	show() {
		this.element.style.display = '';
		this.element.scrollTop = 0;
	}

	/**
	 * Update list items
	 * @param {String} query
	 * @param {{x: Number, y: Number, height: Number}} caretVisual
	 */
	update(query, caretVisual) {
		this.hide();
		if (!query) { return; }
		_.forEach(data, (a) => {
			const li = this.highlightedElement('li', a, query);
			if (!li) { return; }
			li.addEventListener('click', this.clickItem.bind(this));
			this.element.appendChild(li);
		});
		const node = _.first(this.element.childNodes);
		if (!node) { return; }
		this.show();
		node.classList.add('current');
		const crect = this.code.element.getBoundingClientRect();
		const codeWidth = crect.width - Code.SCROLL_BAR_WIDTH;
		const codeHeight = crect.height;
		const caretHeight = caretVisual.height;
		const caretX = caretVisual.x;
		const caretY = caretVisual.y;
		const width = _.min([codeWidth, List.MAX_WIDTH]);
		const height = this.element.getBoundingClientRect().height;
		this.element.style.width = `${width}px`;
		this.element.style.left = `${caretX + width > codeWidth ? codeWidth - width : caretX}px`;
		this.element.style.top = `${caretY + height > codeHeight ? caretY - caretHeight - height : caretY}px`;
	}

	/**
	 * Create highlighted element by a pattern
	 * @param {String} tagName
	 * @param {String} innerText
	 * @param {String} pattern
	 * @returns {Element}
	 */
	highlightedElement(tagName, innerText, pattern) {
		pattern = _.split(pattern, '');
		const element = document.createElement(tagName);
		let i = 0;
		_.forEach(_.split(innerText, ''), (character) => {
			if (character === pattern[i]) {
				const span = document.createElement('span');
				span.classList.add('ed-hl');
				span.innerText = character;
				element.appendChild(span);
				i += 1;
			} else {
				element.appendChild(document.createTextNode(character));
			}
		});
		return i === pattern.length ? element : null;
	};

	get visible() {
		return this.element.style.display !== 'none';
	}

	get value() {
		return this.element.childNodes[this.index].innerText;
	}

	static get MAX_WIDTH() {
		return 700;
	}
}

class Header {

	/**
	 * Control editor header
	 * @param {Code} code
	 */
	constructor(code) {
		const circle = document.querySelector('.ed-header-circle i');

		this.circle = circle;
		this.filename = document.querySelector('.ed-header-filename');
		this.dirname = document.querySelector('.ed-header-dirname');
		this.path = null;

		document.querySelector('.ed-header-icon.close').addEventListener('click', this.closeFile.bind(this));

		this.code = code;
	}

	/**
	 * Set file to header title
	 * @param {MFile} file
	 */
	setFile(file) {
		this.filename.innerText = file.filename;
		this.dirname.innerText = file.dirname;
		this.path = file.path;
	}

	/**
	 * Close the file via Code.
	 */
	closeFile() {
		this.code.closeEditor(this.path);
	}
}

class Navbar {

	/**
	 * Control navbar
	 * @param {Code} code
	 */
	constructor(code) {
		const element = document.querySelector('.navbar');
		this.code = code;
		this.element = element;
		this.items = _.map([
			[document.querySelector('.nv-file'), code.sidebar.explorer.element],
			[document.querySelector('.nv-twitter'), code.sidebar.twitter.element]
		], (a) => {
			a[0].addEventListener('click', this.toggleItem.bind(this));
			return a;
		});
		this.itemIndex = 0;
	}

	toggleItem() {
		const index = parseInt(event.currentTarget.dataset.index, 10);
		const current = this.items[index];
		const previous = this.items[this.itemIndex];
		if (current === previous) {
			this.code.sidebar[current[0].classList.toggle('current') ? 'show' : 'hide']();
		} else {
			_.forEach(previous, (a) => a.classList.remove('current'));
			_.forEach(current, (a) => a.classList.add('current'));
			this.itemIndex = index;
			this.code.sidebar.show();
		}
	}
}

class Sidebar {

	/**
	 * Control sidebar
	 * @param {Code} code
	 */
	constructor(code) {
		const element = document.querySelector('.sidebar');
		const resizer = document.querySelector('.sb-resizer');

		this.code = code;
		this.element = element;
		this.resizer = resizer;
		this.explorer = new SBExplorer(code);
		this.twitter = new SBTwitter(code);
		this.status = Sidebar.STATUS;

		document.body.addEventListener('mousedown', this.mousedown.bind(this));
		document.body.addEventListener('mousemove', this.mousemove.bind(this));
		document.body.addEventListener('mouseup', this.mouseup.bind(this));
	}

	/**
	 * The element is shown, or not
	 */
	visible() {
		return this.element.style.display !== 'none';
	}

	/**
	 * The element is shown
	 */
	show() {
		this.element.style.display = '';
		this.width = _.max([parseFloat(this.element.style.width), Sidebar.MIN_WIDTH]);

		const {navbar} = this.code;
		navbar.items[navbar.itemIndex][0].classList.add('current');
	}

	/**
	 * The element is hidden
	 */
	hide() {
		this.element.style.display = 'none';
		this.resizer.style.left = '0px';

		const {navbar} = this.code;
		navbar.items[navbar.itemIndex][0].classList.remove('current');
	}

	/**
	 * If target is this.resizer, start to drag
	 */
	mousedown() {
		if (event.target !== this.resizer) { return; }
		this.status = Sidebar.STATUS.RESIZE;
		document.body.classList.add('col-resize');
	}

	/**
	 * In dragging, change sidebar width
	 */
	mousemove() {
		if (this.status !== Sidebar.STATUS.RESIZE) { return; }
		const {clientX} = event;
		const navbarWidth = this.code.navbar.element.getBoundingClientRect().width;
		let width = clientX - navbarWidth;

		if (this.visible()) {
			if (width < 100) {
				this.hide();
			} else {
				width = _.max([width, Sidebar.MIN_WIDTH]);
			}
		} else if (Sidebar.MIN_WIDTH < width) {
			this.show();
		} else {
			width = 0;
		}

		this.width = width;
	}

	/**
	 * Drag end
	 */
	mouseup() {
		this.status = Sidebar.STATUS.DEFAULT;
		document.body.classList.remove('col-resize');
	}

	set width(width) {
		this.element.style.width = `${width}px`;
		this.resizer.style.left = `${width}px`;
	}

	static get STATUS() {
		return {
			DEFAULT: 0,
			RESIZE: 1
		};
	}

	static get MIN_WIDTH() {
		return 170;
	}
}

class SBItem {

	/**
	 * Sidebar item.
	 * @param {Code} code
	 */
	constructor(code) {
		this.code = code;
	}

	/**
	 * Calculate directory tree height
	 */
	fit() {
		let sum = 0;
		_.forEach(this.element.childNodes, (a) => {
			if (a === this.tailElement) { return; }
			sum += a.getBoundingClientRect().height;
		});
		this.tailElement.style.height = `${this.element.getBoundingClientRect().height - sum}px`;
	}
}

class SBExplorer extends SBItem {

	/**
	 * The role is a file explorer.
	 * @param {Code} code
	 */
	constructor(code) {
		super(code);

		const element = document.querySelector('.sb-explorer');

		this.element = element;
		this.dirname = element.querySelector('.sb-dirname');
		this.directoryTree = element.querySelector('.sb-directory-tree');
		this.directoryTreeList = this.directoryTree.querySelector('ul');
		this.editorTree = element.querySelector('.sb-editor-tree');
		this.editorTreeList = this.editorTree.querySelector('ul');
		this.tailElement = this.directoryTree;

		this.__savedElements__ = {};
		_.forEach(element.querySelectorAll('.sb-sub-header'), (sh) => sh.addEventListener('click', () => {
			const target = this.__savedElements__[sh.dataset.target] || element.querySelector(sh.dataset.target);
			target.style.display = sh.classList.toggle('selected') ? '' : 'none';
		}));
	}

	/**
	 * Append directory and file elements to parent element.
	 * @param {Element} parentElement
	 * @param {{directories: String[], files: String[]}} results
	 * @param {Number} depth
	 */
	appendDirectories(parentElement, results, depth = 0) {
		const {directories, files} = results;
		_.forEach(['directories', 'files'], (key, i) => _.forEach(results[key], (path) => {
			const basename = nodepath.basename(path);
			const li = document.createElement('li');
			let delta = 1;
			if (i === 0) {
				const span = document.createElement('span');
				span.classList.add('sb-wrap-icon');
				const icon = document.createElement('i');
				icon.classList.add('fa', 'fa-caret-right');
				icon.setAttribute('aria-hidden', true);
				span.appendChild(icon);
				li.appendChild(span);
			} else {
				delta += 1;
			}
			li.dataset.role = ['directory', 'file'][i];
			li.dataset.path = path;
			li.dataset.basename = basename;
			li.dataset.depth = depth;
			li.style.paddingLeft = `${depth * 12 + delta * 16}px`;
			li.appendChild(document.createTextNode(basename));
			li.addEventListener('click', this.selectTreeItem.bind(this));
			parentElement.appendChild(li);
		}));
	}

	/**
	 * Set directories and files on Sidebar.
	 * @param {String} basename
	 * @param {{directories: String[], files: String[]}} results
	 */
	setWorkspace(basename, results) {
		this.code.sidebar.show();
		this.dirname.innerText = basename;
		this.directoryTreeList.innerText = '';

		this.appendDirectories(this.directoryTreeList, results);
	}

	/**
	 * Select a file, open it. Select a directory, expand it.
	 */
	selectTreeItem() {
		const li = _.find(this.directoryTreeList.querySelectorAll('li'), (a) => a.contains(event.target));
		const {role, path, basename, depth} = li.dataset;
		const depthn = parseInt(depth, 10);
		const previous = this.directoryTreeList.querySelector('.current');
		if (previous) { previous.classList.remove('current'); }
		li.classList.add('current');
		if (role === 'directory') {
			const next = li.nextSibling;
			if (li.classList.toggle('selected')) {
				if (parseInt(next.dataset.depth, 10) === depthn) {
					const results = ipcRenderer.sendSync('dig-directory', { path });
					const ul = document.createElement('ul');
					li.parentElement.insertBefore(ul, next);
					this.appendDirectories(ul, results, depthn + 1);
				} else {
					next.style.display = '';
				}
			} else {
				next.style.display = 'none';
			}
		} else if (role === 'file') {
			this.code.openEditor(path);
		}
	}

	/**
	 * Create item to open editors
	 * @param {MFile} file
	 */
	createOpenItem(file) {
		const previous = this.editorTreeList.querySelector('.current');
		if (previous) { previous.classList.remove('current'); }
		const li = document.createElement('li');
		li.classList.add('current');
		li.dataset.path = file.path;
		li.addEventListener('click', this.openFile.bind(this));
		const icon = document.createElement('span');
		icon.classList.add('sb-tree-icon');
		const circle = document.createElement('i');
		circle.classList.add('circle');
		const close = document.createElement('i');
		close.classList.add('fa', 'fa-times');
		_.forEach([circle, close], (a) => icon.appendChild(a));
		const span = document.createElement('span');
		span.classList.add('sub-title');
		span.innerText = file.dirname;
		_.forEach([icon, document.createTextNode(file.filename), span], (a) => li.appendChild(a));
		this.editorTreeList.appendChild(li);
		file.markers.push(circle);
	}

	/**
	 * Open a file on editor
	 */
	openFile() {
		const {target} = event;
		const li = _.find(this.editorTreeList.querySelectorAll('li'), (a) => a.contains(target));
		const {path} = li.dataset;
		if (target.classList.contains('fa-times')) {
			this.code.closeEditor(path);
		} else {
			const previous = this.editorTreeList.querySelector('.current');
			if (previous) { previous.classList.remove('current'); }
			li.classList.add('current');
			this.code.openEditor(path);
		}
	}
}

class SBTwitter extends SBItem {

	/**
	 * The role is to tweet.
	 * @param {Code} code
	 */
	constructor(code) {
		super(code);

		const $element = document.querySelector('.sb-twitter');
		//$element.querySelector('.sb-button').addEventListener('click', this.click.bind(this));
		const $content = $element.querySelector('.sb-twitter-content');;
		const settings = ipcRenderer.sendSync('twitter-settings');
		_.forEach(_.values(settings), ({iconURL, name, screenName}) => {
			const $center = document.createElement('center');
			const $img = document.createElement('img');
			$img.classList.add('twitter-icon');
			$img.src = iconURL;
			const $p = document.createElement('p');
			const $name = document.createElement('span');
			$name.classList.add('twitter-name');
			$name.innerText = name;
			const $screenName = document.createElement('span');
			$screenName.classList.add('twitter-screen-name');
			$screenName.innerText = screenName;
			_.forEach([$name, document.createElement('br'), $screenName], (a) => $p.appendChild(a));
			const $button = document.createElement('a');
			$button.classList.add('sb-button');
			$button.innerText = 'Tweet';
			$button.addEventListener('click', this.click.bind(this));

			_.forEach([$img, $p, $button], (a) => $center.appendChild(a));
			$content.appendChild($center);
		});

		this.element = $element;
		this.tailElement = $content;
	}

	click() {
		const {file} = this.code;
		if (file) {
			file.save();
			const {type, content} = ipcRenderer.sendSync('tweet', { status: this.code.value });
			if (type === 'error') {
				this.code.notification.yo({ type, message: `Code: ${content.code} ${content.message}.` });
			} else {
				this.code.notification.yo({ message: content });
			}
		} else {
			this.code.notification.yo({ message: 'There is no file to tweet.' });
		}
	}
}

new Code(document.querySelector('main'));