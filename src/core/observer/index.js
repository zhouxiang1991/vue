/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
 /**
 * 在组件更新期间，禁止Observe组件变量。不知为何，有待研究。
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
/**
 * Observer类把目标对象上的每个属性转换为getter/setter。
 * getter用于收集依赖，setter用于派发更新。
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    
    // 该字段是为了记录有多少个组件以value作为组件根数据。
    this.vmCount = 0
    
    // 每个被观察对象的都会被定义一个Observe实例，叫__ob__。
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 为了使在修改数组时触发更新。用新的数组方法覆盖了数组原始方法。
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  /**
   * 遍历对象属性将其转化为getter/setter。
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  /**
   * 遍历数组元素。
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
/**
 * 通过拦截对象或数组的原型链来扩充它们的功能。
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/**
 * 通过给对象或数组定义一些方法来扩充它们的功能。
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
/**
 * 如果目标对象已有Observer实例__ob__就直接返回这个实例。
 * 否则就创建一个Observer实例再返回。
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // value必须是数组或者普通对象，否则什么也不做。
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 已被观察过，直接返回。
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  
  /** 
   * 如果该对象是作为组件的根数据。vmCount需要加1。
   */
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
/**
 * 在一个对象上创建一个响应式属性。
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 由此可见，obj对象上的每个key都有一个存在于闭包中的Dep实例。
  const dep = new Dep()
  
  // 获取属性说明。
  const property = Object.getOwnPropertyDescriptor(obj, key)
  
  // 如果对象不可被配置，则什么也不做。
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 将obj[key]的原来getter和setter保存起来。
  const getter = property && property.get
  const setter = property && property.set
  
  // 这里取obj[key]赋值给闭包变量val的判断我认为是有问题的。其实getter和setter应该是要么都有要么都没有。原因如下：现在这里的判断没有考虑到一种情况，那就是没有getter但有setter的情况，因为没有getter，当触发get时，get函数返回的是闭包变量val，但是当触发set时，set函数内部判断当有setter，就调用了setter方法，setter修改的是obj[key]，可是下次触发get函数时返回的仍旧是val，这会导致get方法每次返回的值都是val，val一直不会被修改，所以有问题。
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }
  
  // 因为闭包变量val可能是数组或对象，如果不对它进行observe操作，那它内部数据更改就检测不到了，所以这里还是要再处理一下。
  let childOb = !shallow && observe(val)
  
  // 定义get和set。
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 获取当前值。
      const value = getter ? getter.call(obj) : val
      
      /**
       * 这里进行依赖收集，这里Dep相当于只是一个全局变量，方便存放当前活动的Watcher实例也就是target。
       */
      if (Dep.target) {
        // 属于obj[key]的闭包变量dep把target加入依赖，这代表target依赖obj[key]。
        dep.depend()
        
        if (childOb) {
          // 属于obj[key]的闭包变量childOb，也就是obj[key]是数组或对象时被Observe后返回的Observe实例上的dep也要将target加入当前依赖，目的是：如果用户修改了obj[key]深层次的属性，这里不做依赖收集的话，就不会触发更新。例如watch的deep属性。
          childOb.dep.depend()
          
          // 如果childOb是数组，还要进行深层次的依赖收集。
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 获取当前值。
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      
      /**
       * 这里判断一下新值和旧值是否绝对相等。
       * 如果相等就不做处理。
       * 如果不相等，且新旧值都是'自比较'都不等的数据也不做处理。
       */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      // 当触发set后，调用用户传递的函数。
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 上面说明了，一个有一个没有的情况是不被允许的。
      if (getter && !setter) return
      
      // 更新数据。
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      
      // 新值当然也要被观察。
      childOb = !shallow && observe(newVal)
      
      // 最后通知dep中的watchers执行更新。
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
 /**
 * 动态设置响应式变量。
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 变量类型判断。
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 防止数组元素不够而调用splice失败。
    target.length = Math.max(target.length, key)
    // 修改数组。
    target.splice(key, 1, val)
    return val
  }
  
  // 如果key已存在就简单赋值。
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  // 尽量避免在组件实例上添加响应式变量。
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  
  // 如果没有Observer过，也是直接简单赋值，因为给一个没有Observer的对象单独设置响应式变量没有意义。
  if (!ob) {
    target[key] = val
    return val
  }
  
  
  // 设置响应式变量。
  defineReactive(ob.value, key, val)
  
  // 刚设置的变量总希望立即更新到dom上，所以手动触发更新。
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
 /**
 * 从对象上删除一个变量。该功能很少被用到。
 */
export function del (target: Array<any> | Object, key: any) {
  // 变量类型判断。
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  
  // 删除数组元素。
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  
  // 尽量避免在组件实例上删除属性。
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  
  // 如果对象没有该属性就返回。
  if (!hasOwn(target, key)) {
    return
  }
  
  // 删除属性。
  delete target[key]
  
  // 如果target没有被Observer过就不用通知更新了。
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
 /**
 * 遍历数组进行依赖收集。这里有一点需要注意，只有数组元素是合法的可观察对象，也就是数组和原始对象才会被处理。基础数据类型的修改是不会被检测到的，必须依赖vue新的数组变异方法才可以触发更新。
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
