import * as d3 from "d3";

import "./style.css";

import {
    IProvenanceSlide,
    ProvenanceSlide,
    IProvenanceSlidedeck,
    ProvenanceSlidedeckPlayer,
    STATUS,
    SlideAnnotation
} from "@visualstorytelling/provenance-core";

// Master
import { AnnotationDisplayContainer } from "./annotation-display/annotation-display-container";
import { PositionedString } from "./annotation-display/annotation-display";

function firstArgThis(f: (...args: any[]) => any) {
    return function(this: any, ...args: any[]) {
        return f(this, ...args);
    };
}

type IndexedSlide = { slide: IProvenanceSlide; startTime: number };

export class SlideDeckVisualization {
    private _slideDeck: IProvenanceSlidedeck;
    private _root: d3.Selection<HTMLDivElement, undefined, null, undefined>;
    private _slideTable: d3.Selection<SVGElement, undefined, null, undefined>;
    private _tableHeight = 150;
    private _tableWidth = 1800;
    private _minimumSlideDuration = 5000;
    private _barHeightTimeMultiplier = 0.01;
    private _barWidthTimeMultiplier = 0.05;
    private _barWidth = 270;
    private _barPadding = 5;
    private _resizebarwidth = 5;
    private _timelineShift = 0;
    private _resizebarheight = 5;
    private _previousSlideX = 0;
    private _toolbarX = 10;
    private _toolbarY = 35;
    private _toolbarPadding = 20;
    private _lineX1 = 30;
    private _placeholderWidth = 60;
    private _placeholderY = 80;
    private _placeholderX = 30;
    private _playerPlaceholderX = this._tableWidth / 2;
    private _placeholderHeight = 30;
    private _maxSlides = 20;

    private _slideDuration = 5000;
    private _timeIndexedSlides: IndexedSlide[] = [];
    private _player: ProvenanceSlidedeckPlayer<IProvenanceSlide>;
    private _nextSlideX = 30;
    private _svgTimePointer: any;
    private _isResume = false;
    private _index = (slide: IProvenanceSlide): number => {
        return this._slideDeck.slides.indexOf(slide);
    }

    private onDelete = (slide: IProvenanceSlide) => {
        this._slideDeck.removeSlide(slide);
    }
    private getCurrentX(slide: IProvenanceSlide) {
        this._nextSlideX = 30;
        let currentSlideIndex = this._index(slide);
        for (let i = 0; i < currentSlideIndex; i++) {
            this._nextSlideX += this.barTotalWidth(this._slideDeck.slides[i]);
        }
        this.animateTimer(0);
    }
    private onSelect = (slide: IProvenanceSlide) => {
        if (d3.event.defaultPrevented) return;
        this._slideDeck.selectedSlide = slide;
        this.getCurrentX(slide);
    }
    private barTotalWidth(slide: IProvenanceSlide) {
        let calculatedWidth =
            this.barTransitionTimeWidth(slide) + this.barDurationWidth(slide);

        return calculatedWidth;
    }
    private barTransitionTimeWidth(slide: IProvenanceSlide) {
        let calculatedWidth =
            this._barWidthTimeMultiplier * slide.transitionTime;
        return Math.max(calculatedWidth, 0);
    }
    private barDurationWidth(slide: IProvenanceSlide) {
        let calculatedWidth = this._barWidthTimeMultiplier * slide.duration;
        return Math.max(
            calculatedWidth,
            this._minimumSlideDuration * this._barWidthTimeMultiplier
        );
    }
    private onMouseEnter() {
        let toolbar = d3.event.target.parentElement.querySelector(
            ".slide_toolbar"
        );
        toolbar.style.display = "block";
    }
    private onMouseLeave() {
        let toolbar = d3.event.target.parentElement.querySelector(
            ".slide_toolbar"
        );
        toolbar.style.display = "none";
    }

    private onAdd = () => {
        let slideDeck = this._slideDeck;
        const node = slideDeck.graph.current;
        const slide = new ProvenanceSlide(node.label, 5000, 0, [], node);
        slideDeck.addSlide(
            slide,
            slideDeck.selectedSlide
                ? slideDeck.slides.indexOf(slideDeck.selectedSlide) + 1
                : slideDeck.slides.length
        );
        // Master
        node.metadata.isSlideAdded = true;
        slideDeck.graph.emitNodeChangedEvent(node);
    }
    private onClone = (slide: IProvenanceSlide) => {
        let slideDeck = this._slideDeck;
        const cloneSlide = new ProvenanceSlide(
            slide.name,
            5000,
            0,
            [],
            slide.node
        );
        slideDeck.addSlide(
            cloneSlide,
            slideDeck.selectedSlide
                ? slideDeck.slides.indexOf(slideDeck.selectedSlide) + 1
                : slideDeck.slides.length
        );
    }

    private moveDragStarted(draggedObject: any) {
        d3.select<any, any>(this).classed("active", true);
    }

    private moveDragged = (that: any, draggedObject: any) => {
        d3.select<any, any>(that).attr(
            "transform",
            (slide: IProvenanceSlide) => {
                const originalX =
                    this.previousSlidesWidth(slide) - this._timelineShift;
                const draggedX = d3.event.x;
                const myIndex = this._slideDeck.slides.indexOf(slide);

                if (draggedX < originalX && myIndex > 0) {
                    // check upwards
                    const previousSlide = this._slideDeck.slides[myIndex - 1];
                    let previousSlideCenterY =
                        this.previousSlidesWidth(previousSlide) -
                        this._timelineShift +
                        this.barTotalWidth(previousSlide) / 2;

                    if (draggedX < previousSlideCenterY) {
                        this._slideDeck.moveSlide(myIndex, myIndex - 1);
                    }
                } else if (
                    draggedX > originalX &&
                    myIndex < this._slideDeck.slides.length - 1
                ) {
                    // check downwards
                    const nextSlide = this._slideDeck.slides[myIndex + 1];
                    let nextSlideCenterY =
                        this.previousSlidesWidth(nextSlide) -
                        this._timelineShift +
                        this.barTotalWidth(nextSlide) / 2;

                    if (draggedX > nextSlideCenterY) {
                        this._slideDeck.moveSlide(myIndex, myIndex + 1);
                    }
                }
                let slidePosition = d3.event.x - this._timelineShift;
                return "translate(" + slidePosition + ", 30)";
            }
        );
    }

    private moveDragended = (that: any, draggedObject: any) => {
        d3.select<any, any>(that)
            .classed("active", false)
            .attr("transform", (slide: IProvenanceSlide) => {
                return (
                    "translate(" +
                    (this.previousSlidesWidth(slide) + 30) +
                    ", 30)"
                );
            });
    }

    private durationDragged = (that: any, slide: IProvenanceSlide) => {
        slide.duration =
            Math.max(0, d3.event.y) / this._barHeightTimeMultiplier;
        this.update();
    }
    private durationSubject = (that: any, slide: IProvenanceSlide) => {
        return { y: this.barDurationHeight(slide) };
    }

    private barDurationHeight(slide: IProvenanceSlide) {
        let calculatedHeight = this._barHeightTimeMultiplier * slide.duration;
        return Math.max(
            calculatedHeight,
            this._minimumSlideDuration * this._barHeightTimeMultiplier
        );
    }

    private previousSlidesWidth(slide: IProvenanceSlide) {
        let myIndex = this._slideDeck.slides.indexOf(slide);
        let calculatedWidth = 0;

        for (let i = 0; i < myIndex; i++) {
            calculatedWidth += this.barTotalWidth(this._slideDeck.slides[i]);
        }

        return calculatedWidth;
    }
    private updateTimeIndices(slideDeck: IProvenanceSlidedeck) {
        this._timeIndexedSlides = [];
        let timeIndex = 0;
        slideDeck.slides.forEach(slide => {
            this._timeIndexedSlides.push({
                slide: slide,
                startTime: timeIndex
            });
            timeIndex += slide.transitionTime + slide.duration;
        });
    }
    private updateTimePointer(isPrev: boolean) {
        let selectedSlide = this._slideDeck.selectedSlide;
        if (selectedSlide) {
            this.updateNextSlideX(selectedSlide, isPrev);
            this.animateTimer(0);
        }
    }
    private onNext = () => {
        this._slideDeck.next();
        this.updateTimePointer(false);
    }

    private onPrevious = () => {
        this._slideDeck.previous();
        this.updateTimePointer(true);
    }
    private onPlay = () => {
        if (this._player.status === STATUS.IDLE) {
            let selectedSlide = this._slideDeck.selectedSlide;
            if (selectedSlide) {
                this._player.currentSlideIndex = this._index(selectedSlide);
                this._player.play();
            }
        } else {
            this._player.stop();
            this._isResume = true;
            this.startPlayer();
        }

        d3.select(d3.event.target).classed(
            "fa-play",
            d3.select(d3.event.target).classed("fa-play") ? false : true
        );
        d3.select(d3.event.target).classed(
            "fa-pause",
            d3.select(d3.event.target).classed("fa-pause") ? false : true
        );
    }
    private startPlayer() {
        if (this._player.status === STATUS.PLAYING) {
            this.animateTimer(this._slideDuration);
        } else {
            this._svgTimePointer.interrupt();
        }
    }
    private animateTimer(duration: number) {
        console.log(this._nextSlideX);
        this._svgTimePointer
            .transition()
            .ease(d3.easeLinear)
            .duration(duration)
            .attr("cx", this._nextSlideX)
            .on("end", () => this.isLastSlide());
    }
    private updateNextSlideX(slide: IProvenanceSlide, isPrevious: boolean) {
        if (!isPrevious) {
            this._nextSlideX += this.barTotalWidth(slide);
        } else {
            this._nextSlideX -= this.barTotalWidth(slide);
        }
    }

    isLastSlide() {
        if (this._slideDeck.selectedSlide !== null) {
            if (
                this._slideDeck.slides.indexOf(
                    this._slideDeck.selectedSlide
                ) ===
                this._slideDeck.slides.length - 1
            ) {
                setTimeout(() => {
                    this._nextSlideX = 30;
                    this._svgTimePointer.attr("cx", this._nextSlideX);
                    this._slideDeck.selectedSlide = this._slideDeck.slides[0];
                    this._slideTable
                        .select(".fa-pause")
                        .classed("fa-play", true)
                        .classed("fa-pause", false);
                    this._player.stop();
                    this._player.currentSlideIndex = 0;
                }, this._slideDeck.selectedSlide.duration + 2000);
            }
        }
    }
    public update() {
        this.updateTimeIndices(this._slideDeck);

        const allExistingNodes = this._slideTable
            .selectAll<SVGAElement, IProvenanceSlide>("g.slide")
            .data<any>(this._slideDeck.slides, (d: IProvenanceSlide) => {
                return d.id;
            });

        const that = this;
        const newNodes = allExistingNodes
            .enter()
            .append("g")
            .attr("class", "slide")
            .call(
                (d3.drag() as any)
                    .clickDistance([2, 2])
                    .on("start", this.moveDragStarted)
                    .on("drag", firstArgThis(this.moveDragged))
                    .on("end", firstArgThis(this.moveDragended))
            );
        // newNodes
        //     .append("rect")
        //     .attr("class", "slides_transitionTime_rect")
        //     .attr("x", this._resizebarwidth)
        //     .attr("y", 0)
        //     .attr("height", 60)
        //     .on("click", this.onSelect);
        // newNodes
        //     .append("rect")
        //     .attr("class", "slides_delay_resize")
        //     .attr("x", this._barPadding)
        //     .attr("width", this._barWidth - 2 * this._barPadding)
        //     .attr("height", this._resizebarheight)
        //     .attr("cursor", "ns-resize")
        //     .call(
        //         (d3.drag() as any)
        //             .subject(firstArgThis(this.delaySubject))
        //             .on("drag", firstArgThis(this.delayDragged))
        //     );

        // newNodes
        //     .append("rect")
        //     .attr("class", "slides_delay_rect")
        //     .attr("x", this._barPadding)
        //     .attr("y", 0)
        //     .attr("width", this._barWidth - 2 * this._barPadding)
        //     .on("click", this.onSelect);

        let slideGroup = newNodes
            .append("g")
            .attr("transform", "translate(5,0)")
            .attr("class", "slide_group")
            .on("mouseenter", this.onMouseEnter)
            .on("mouseleave", this.onMouseLeave);

        slideGroup
            .append("rect")
            .attr("class", "slides_rect")
            .attr("height", 60)
            .attr("cursor", "move")
            .on("click", this.onSelect);

        slideGroup
            .append("svg")
            .attr("class", "text-viewport")
            .attr("height", 60)
            .append("text") // appended previous slides_text
            .attr("class", "slides_text")
            .attr("y", this._resizebarwidth + 2 * this._barPadding)
            .attr("font-size", 20)
            .attr("dy", ".35em");
        slideGroup
            .append("image")
            .attr("class", "screenshot")
            .attr("opacity", 0.8);
        slideGroup
            .append("text")
            .attr("class", "slides_delaytext")
            .attr("x", 2 * this._barPadding)
            .attr("dy", ".35em");
        let toolbar = slideGroup.append("g").attr("class", "slide_toolbar");
        toolbar
            .append("svg:foreignObject")
            .attr("class", "slides_delete_icon")
            .attr("x", this._toolbarX)
            .attr("cursor", "pointer")
            .attr("width", 20)
            .attr("height", 20)
            .append("xhtml:body")
            .on("click", this.onDelete)
            .html('<i class="fa fa-trash-o"></i>');

        toolbar
            .append("svg:foreignObject")
            .attr("class", "slides_clone_icon")
            .attr("x", this._toolbarX + this._toolbarPadding)
            .attr("cursor", "pointer")
            .attr("width", 20)
            .attr("height", 20)
            .append("xhtml:body")
            .on("click", this.onClone)
            .html('<i class="fa fa-copy"></i>');

        const slidePlaceholder = this._slideTable.select(
            "rect#slide_placeholder"
        );
        const playerPlaceholder = this._slideTable.select(
            "rect#player_placeholder"
        );

        newNodes
            .append("circle")
            .attr("class", "time")
            .attr("cx", 0)
            .attr("r", 3)
            .attr("fill", "black");

        newNodes
            .append("rect")
            .attr("class", "slides_duration_resize")
            .attr("x", this._barPadding)
            .attr("width", this._barWidth - 2 * this._barPadding)
            .attr("height", this._resizebarheight)
            .attr("cursor", "ns-resize")
            .call(
                (d3.drag() as any)
                    .subject(firstArgThis(this.durationSubject))
                    .on("drag", firstArgThis(this.durationDragged))
            );

        // Update all nodes

        const allNodes = newNodes
            .merge(allExistingNodes as any)
            .attr("transform", (slide: IProvenanceSlide) => {
                this._previousSlideX = this.previousSlidesWidth(slide);
                slide.xPosition = 30 + this.previousSlidesWidth(slide);
                return (
                    "translate(" +
                    (slide.xPosition - this._timelineShift) +
                    ", 30 )"
                );
            });
        allNodes
            .select("image.screenshot")
            .attr("href", d => d.metadata.screenShot)
            .attr("width", (slide: IProvenanceSlide) => {
                this._placeholderX =
                    this._previousSlideX +
                    this.barDurationWidth(slide) +
                    this.barTransitionTimeWidth(slide);
                return this.barDurationWidth(slide);
            })
            .attr("height", 60)
            .attr("x", (slide: IProvenanceSlide) => {
                return this.barTransitionTimeWidth(slide);
            });
        // allNodes
        //     .select("rect.slides_delay_rect")
        //     .attr("height", (slide: IProvenanceSlide) => {
        //         return this.barDelayHeight(slide);
        //     });

        // allNodes
        //     .select("rect.slides_delay_resize")
        //     .attr("y", (slide: IProvenanceSlide) => {
        //         return this.barDelayHeight(slide);
        //     });
        slideGroup = allNodes.select("g.slide_group");
        slideGroup
            .select("rect.slides_rect")
            .attr("selected", (slide: IProvenanceSlide) => {
                return this._slideDeck.selectedSlide === slide;
            })
            .attr("x", (slide: IProvenanceSlide) => {
                return this.barTransitionTimeWidth(slide);
            })
            .attr("width", (slide: IProvenanceSlide) => {
                this._previousSlideX =
                    this._previousSlideX +
                    this.barDurationWidth(slide) +
                    this.barTransitionTimeWidth(slide) +
                    this._resizebarheight;
                return this.barDurationWidth(slide);
            });

        toolbar = allNodes.select("g.slide_toolbar");
        toolbar
            .select("foreignObject.slides_delete_icon")
            .attr("y", (slide: IProvenanceSlide) => {
                return this._toolbarY;
            })
            .attr("x", (slide: IProvenanceSlide) => {
                return this._toolbarX + this.barTransitionTimeWidth(slide) - 3;
            });
        toolbar
            .select("foreignObject.slides_clone_icon")
            .attr("y", (slide: IProvenanceSlide) => {
                return this._toolbarY;
            })
            .attr("x", (slide: IProvenanceSlide) => {
                return (
                    this._toolbarX +
                    this._toolbarPadding +
                    this.barTransitionTimeWidth(slide) -
                    3
                );
            });
        slideGroup
            .select("text.slides_text")
            .attr("x", (slide: IProvenanceSlide) => {
                return this._barPadding * 2 - 2;
            })
            .text((slide: IProvenanceSlide) => {
                return slide.name;
            });

        // slideGroup
        //     .select("text.slides_delaytext")
        //     .attr("y", (slide: IProvenanceSlide) => {
        //         return (
        //             this.barDelayHeight(slide) +
        //             this._resizebarheight +
        //             1 * this._barPadding +
        //             25
        //         );
        //     })
        //     .text((slide: IProvenanceSlide) => {
        //         return "transition: " + slide.delay / 1000;
        //     });

        allNodes.select("circle.time").attr("cx", (slide: IProvenanceSlide) => {
            return this.barTotalWidth(slide) + this._resizebarheight;
        });
        allNodes
            .select("circle.transitionTime_time")
            .attr("cx", (slide: IProvenanceSlide) => {
                return (
                    this.barTransitionTimeWidth(slide) + this._resizebarwidth
                );
            });
        allNodes
            .select("rect.slides_duration_resize")
            .attr("y", (slide: IProvenanceSlide) => {
                return this.barTotalWidth(slide);
            });
        allNodes
            .select("text.slides_durationtext")
            .attr("x", (slide: IProvenanceSlide) => {
                return this.barTotalWidth(slide) + this._barPadding + 10;
            })
            .text((slide: IProvenanceSlide) => {
                return slide.duration / 5000;
            });

        slidePlaceholder.attr("y", this._placeholderY + 20);
        playerPlaceholder.attr("width", 130);
        playerPlaceholder.attr("x", this._playerPlaceholderX);
        playerPlaceholder.attr("y", this._placeholderY + 20);
        this._slideTable.select("line").attr("y2", this._placeholderY + 20);
        this._slideTable
            .select("foreignObject.slide_add")
            .attr("y", this._placeholderY + 26);
        this.startPlayer();
        allExistingNodes.exit().remove();
    }

    private dragEnded = (that: any, draggedObject: any) => {
        d3.select<any, any>(that)
            .transition()
            .ease(d3.easeLinear)
            .duration(0)
            .attr("cx", d3.event.x);
        console.log("dragged", d3.event.x);
        console.log("slide At Time", this._slideDeck.slideAtTime(10));
    }
    constructor(slideDeck: IProvenanceSlidedeck, elm: HTMLDivElement) {
        this._slideDeck = slideDeck;
        this._root = d3.select(elm);
        this._slideTable = this._root
            .append<SVGElement>("svg")
            .attr("class", "slide__table")
            .attr("height", this._tableHeight)
            .attr("width", this._tableWidth);
        this._slideTable
            .append("rect")
            .attr("class", "slides_background_rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("height", this._tableHeight)
            .attr("width", this._tableWidth);
        this._slideTable
            .append("line")
            .attr("class", "vertical-line")
            .attr("x1", this._lineX1)
            .attr("y1", 30)
            .attr("x2", this._lineX1)
            .attr("y2", 90)
            .attr("stroke", "gray")
            .attr("stroke-width", 2);

        this._svgTimePointer = this._slideTable
            .append("circle")
            .attr("class", "currentTime")
            .attr("cx", this._lineX1)
            .attr("cy", 95)
            .attr("r", 3)
            .attr("fill", "red")
            .call(
                (d3.drag() as any)
                    .clickDistance([2, 2])
                    .on("end", firstArgThis(this.dragEnded))
            );
        this.setPlaceholder("slide_placeholder");
        this.setPlaceholder("player_placeholder");
        this.setAddButton();

        this.setPreviousButton();
        this.setPlayButton();
        this.setNextButton();
        this._player = new ProvenanceSlidedeckPlayer(
            this._slideDeck.slides,
            nextSlide => {
                this._slideDuration = nextSlide.duration;
                if (!this._isResume) {
                    this.updateNextSlideX(nextSlide, false);
                } else {
                    this._isResume = false;
                }
                console.log("Selected Slide", nextSlide);
                this._slideDeck.selectedSlide = nextSlide;
            }
        );
        slideDeck.on("slideAdded", () => this.update());
        slideDeck.on("slideRemoved", () => this.update());
        slideDeck.on("slidesMoved", () => this.update());
        slideDeck.on("slideSelected", () => this.update());

        this.update();
    }

    private setPlaceholder(id: string) {
        this._slideTable
            .append("rect")
            .attr("id", id)
            .attr("class", "slides_placeholder")
            .attr("x", this._lineX1 + this._barPadding)
            .attr("y", 0)
            .attr("width", this._placeholderWidth)
            .attr("height", this._placeholderHeight);
    }
    private setAddButton() {
        this._slideTable
            .append("svg:foreignObject")
            .attr("class", "slide_add")
            .attr("x", this._placeholderX + 30)
            .attr("cursor", "pointer")
            .attr("width", 30)
            .attr("height", 30)
            .append("xhtml:body")
            .on("click", this.onAdd)
            .html('<i class="fa fa-file-text-o" title="Add Slide"></i>');
    }

    private setPlayButton() {
        this._slideTable
            .append("svg:foreignObject")
            .attr("id", "slide_play")
            .attr("x", this._playerPlaceholderX + 60)
            .attr("y", this._placeholderY + 25)
            .attr("cursor", "pointer")
            .attr("width", 20)
            .attr("height", 20)
            .append("xhtml:body")
            .on("click", this.onPlay)
            .html('<i class="fa fa-play" title="Play"></i>');
    }
    private setNextButton() {
        this._slideTable
            .append("svg:foreignObject")
            .attr("x", this._playerPlaceholderX + 100)
            .attr("y", this._placeholderY + 25)
            .attr("cursor", "pointer")
            .attr("width", 20)
            .attr("height", 20)
            .append("xhtml:body")
            .on("click", this.onNext)
            .html('<i class="fa fa-step-forward" title="Next Slide"></i>');
    }
    private setPreviousButton() {
        this._slideTable
            .append("svg:foreignObject")
            .attr("x", this._playerPlaceholderX + 20)
            .attr("y", this._placeholderY + 25)
            .attr("cursor", "pointer")
            .attr("width", 20)
            .attr("height", 20)
            .append("xhtml:body")
            .on("click", this.onPrevious)
            .html('<i class="fa fa-step-backward" title="Previous Slide"></i>');
    }
}
