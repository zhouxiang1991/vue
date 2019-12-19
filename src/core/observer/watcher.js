/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
 /**
  * watcher解析表达式然后收集依赖，之后在表达式的值发生变化时，触发回调。
  * 目前watcher被用到的地方有三种。1，computed。2，watch。3，updateComponent。
  */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    
    // 如果是render类型的watcher，需要在vm实例上定义_watcher。
    if (isRenderWatcher) {
      vm._watcher = this
    }
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep // 是否深度观察。
      this.user = !!options.user // 是否是用户定义的watcher。
      this.lazy = !!options.lazy // 表示初始化时不会调用get函数。
      this.sync = !!options.sync // 是否是同步的。
      this.before = options.before // 调用run方法之前先调用的方法。
    } else {
      this.deep = this.user = this.lazy = this.sync = false // 默认都是false。
    }
    this.cb = cb // 回调。
    this.id = ++uid // uid for batching
    this.active = true // 表示当前watcher是激活的。
    this.dirty = this.lazy // for lazy watchers
    this.deps = [] // 当前依赖。
    this.newDeps = [] // 最新依赖。
    this.depIds = new Set() // 当前依赖id数组。
    this.newDepIds = new Set() // 最新依赖id数组。
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    /**
     * 如果表达式是字符串则将其解析成函数或是本身就是函数就直接赋值给getter。
     */
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    
    // 如果不是惰性watcher，则立即调用get方法。
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
   /**
   * 调用getter方法，并完成依赖的收集和整理的同时获取表达式的值。
   */
  get () {
    // 将当前watcher入栈。
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 调用getter方法，getter方法中所有访问到的vm实例中已被附加getter和setter的属性变量都会将当前watcher视为依赖，并加入到它们dep中。
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果是watch类型，并指定了深度观察，则需要对value再遍历访问一下。
      if (this.deep) {
        traverse(value)
      }
      
      // 将当前watcher弹出。
      popTarget()
      
      // 重新整理依赖关系。因为每次调用getter时访问的变量都是不固定的，有可能有访问过新的变量，也有可能有些之前访问的变量现在不访问，这样做也是为了优化性能。
      this.cleanupDeps()
    }
    
    // 最终返回getter结果。
    return value
  }

  /**
   * Add a dependency to this directive.
   */
   /**
   * 将dep加入到自己的数组中。
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  /**
   * 整理依赖关系。
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  /**
   * 根据sync字段判断何时重新执行run函数。
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  /**
   * 判断watcher是否可被执行，然后调用get函数，即重新处理依赖关系的同时又获取最新值触发更新的最新值，最后将新旧值传递给回调函数并执行。
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  /**
   * 手动触发get函数。
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  /**
   * 将当前dep数组中的每个dep都视为依赖。
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  /**
   * 跟depend操作相反。从组件实例上删除当前watcher并清除当前依赖关系，最后设置自己为非激活状态。
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
