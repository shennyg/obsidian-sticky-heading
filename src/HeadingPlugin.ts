import { EditorView, PluginValue, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { StickyHeadingSettings } from "./settings";
import { App, Component, MarkdownRenderer } from "obsidian";

const headingExp = /^HyperMD-header_HyperMD-header-(\d)$/;
const OBSIDIAN_STICKY_HEADING_CLASS = "obsidian-sticky-heading";
const CONTENT_CLASS = "cm-content";

function getDistanceFromContentToScroller(view: EditorView) {
    const scroller = view.scrollDOM;
    const contentContainer = view.scrollDOM.querySelector(`.${CONTENT_CLASS}`);
    let distance = 0;
    if (!scroller || !contentContainer) return distance;

    let currentElement = contentContainer as HTMLElement;
    while (currentElement && currentElement !== scroller) {
        distance += currentElement.offsetTop;
        currentElement = currentElement.offsetParent as HTMLElement;
    }
    return distance;
}

export function HeadingPlugin(settings: StickyHeadingSettings, app: App) {
    return ViewPlugin.fromClass(
        class HeadingViewPlugin implements PluginValue {
            stickyDom: HTMLElement;
            view: EditorView;
            headings: [number, string, number][];
            oldHeadings: [number, string, number][];
            settings: StickyHeadingSettings;

            constructor(view: EditorView) {
                this.stickyDom = document.createElement("div");
                this.stickyDom.classList.add(OBSIDIAN_STICKY_HEADING_CLASS, "markdown-rendered");
                this.view = view;
                this.headings = [];
                this.oldHeadings = [];
                this.settings = settings;
                this.init(view);
            }

            init(view: EditorView) {
                view.dom.appendChild(this.stickyDom);
                view.scrollDOM.addEventListener("scroll", this.handleScroll.bind(this));
                this.updateHeaders(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged || update.heightChanged) {
                    this.updateHeaders(update.view);
                }
            }

            destroy() {
                this.stickyDom.remove();
            }

            handleScroll() {
                this.updateHeaders(this.view);
            }

            updateStickyDom() {
                const dom = document.createElement("div");
                dom.classList.add(`${OBSIDIAN_STICKY_HEADING_CLASS}_inner`);
                
                this.headings.forEach(([level, text, position]) => {
                    const header = document.createElement("div");
                    header.classList.add("HyperMD-header", `HyperMD-header-${level}`);
                    header.style.cursor = "pointer";
                    
                    const headerContent = document.createElement("div");
                    headerContent.classList.add("cm-header", `cm-header-${level}`);
                    
                    const levelDom = document.createElement("div");
                    levelDom.classList.add(`${OBSIDIAN_STICKY_HEADING_CLASS}_level`);
                    levelDom.textContent = `h${level}`;
                    headerContent.appendChild(levelDom);
                    
                    const textDom = document.createElement("div");
                    textDom.classList.add(`${OBSIDIAN_STICKY_HEADING_CLASS}_text`);
                    MarkdownRenderer.render(app, text, textDom, "", new Component());
                    headerContent.appendChild(textDom);
                    header.appendChild(headerContent);
                    dom.appendChild(header);
                    
                    // Click event for scrolling
                    header.addEventListener("click", () => {
                        const coords = this.view.coordsAtPos(position);
                        // @TODO figure out why sometimes coords is undefined
                        if (coords) {
                            this.view.scrollDOM.scrollTo({ 
                                top: this.view.scrollDOM.scrollTop + coords.top - this.stickyDom.clientHeight, 
                                behavior: "smooth" 
                            });
                        }
                    });
                });
                
                this.stickyDom.replaceChildren(dom);
            }

            updateHeaders(view?: EditorView) {
                let editorView = view || this.view;
                if (editorView) {
                    let headerChanged = false;
                    editorView.requestMeasure({
                        read: () => {
                            this.oldHeadings = this.headings;
                            const oldHeadingsJsonStr = JSON.stringify(this.headings);
                            this.findHeaders(editorView);
                            if (this.oldHeadings.length !== this.headings.length || oldHeadingsJsonStr !== JSON.stringify(this.headings)) {
                                headerChanged = true;
                            }
                        },
                        write: () => {
                            if (headerChanged) this.updateStickyDom();
                        }
                    });
                }
            }

            findHeaders(view: EditorView): [number, string, number][] {
                const headerOutViewList: [number, string, number][] = [];
                let distance = getDistanceFromContentToScroller(view);
                const headings: [number, string, number][] = [];
                let offset = -10;
                if (this.oldHeadings.length !== 0) offset = 10;
                if (settings.stickyType === "prevToH1" && this.stickyDom?.clientHeight) {
                    offset = this.stickyDom.clientHeight - 16;
                }
                let height = view.scrollDOM.scrollTop - distance + offset;
                
                if (height > 0) {
                    const firstElementBlockInfo = view.elementAtHeight(height);
                    syntaxTree(view.state).iterate({
                        from: 0,
                        to: firstElementBlockInfo.from,
                        enter: (node) => {
                            let regExpExecArray = headingExp.exec(node.name);
                            if (regExpExecArray) {
                                const level = Number(regExpExecArray[1]);
                                const text = view.state.sliceDoc(node.from, node.to).trim();
                                headerOutViewList.unshift([level, text, node.from]);
                            }
                        },
                    });
                }
                
                const type = settings.stickyType;
                let biggestLevel = Number.MAX_SAFE_INTEGER;
                for (let value of headerOutViewList) {
                    if (type === "prev") {
                        headings.unshift(value);
                        break;
                    } else if (type === "prevToH1") {
                        const level = value[0];
                        if (level < biggestLevel) {
                            headings.unshift(value);
                            biggestLevel = level;
                        }
                    }
                }
                this.headings = headings;
                return headings;
            }
        }
    );
}
