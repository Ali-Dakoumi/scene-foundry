import { ScrollTrigger } from 'gsap/ScrollTrigger';

export class AnimationManager {
  private readonly tweens = new Set<gsap.core.Tween>();
  private readonly timelines = new Set<gsap.core.Timeline>();
  private readonly triggers = new Set<ScrollTrigger>();

  registerTween(tween: gsap.core.Tween): gsap.core.Tween {
    this.tweens.add(tween);
    return tween;
  }

  registerTimeline(timeline: gsap.core.Timeline): gsap.core.Timeline {
    this.timelines.add(timeline);
    return timeline;
  }

  registerTrigger(trigger: ScrollTrigger): ScrollTrigger {
    this.triggers.add(trigger);
    return trigger;
  }

  stopAll(): void {
    this.tweens.forEach((tween) => tween.pause());
    this.timelines.forEach((timeline) => timeline.pause());
    this.triggers.forEach((trigger) => trigger.disable(false));
  }

  resumeAll(): void {
    this.tweens.forEach((tween) => tween.resume());
    this.timelines.forEach((timeline) => timeline.resume());
    this.triggers.forEach((trigger) => trigger.enable(false));
  }

  killAll(): void {
    this.triggers.forEach((trigger) => trigger.kill(true));
    this.timelines.forEach((timeline) => timeline.kill());
    this.tweens.forEach((tween) => tween.kill());
    this.triggers.clear();
    this.timelines.clear();
    this.tweens.clear();
  }
}
