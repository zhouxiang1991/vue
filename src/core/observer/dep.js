/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++ // dep id。
    this.subs = [] // 存放watcher的数组。
  }

  // 增加watcher到订阅数组。
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }
  
  // 移除watcher从订阅数组。
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 调用当前激活的watcher的addDep方法，该方法会调用depdeaddSub方法。
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }
  
  // 遍历订阅数组元素调用update方法。
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null // 当前激活的watcher。
const targetStack = []

// 设置当前激活watcher。
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// 弹出当前激活watcher，设置上一次的watcher为激活状态。
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
