import type { BlockBinding, PageDisplayMode, TranslationBlock, TranslationInsertion } from '@lingoflow/types'
import {
  AfterBlockStrategy,
  BeforeNestedStructureStrategy,
  InlineInsideStrategy,
  InsideContainerStrategy,
  LinebreakInsideStrategy,
  type InsertionStrategy,
} from './strategies'

export class StrategyRegistry {
  private readonly strategies: InsertionStrategy[] = []

  constructor(strategies: InsertionStrategy[] = []) {
    for (const strategy of strategies) {
      this.register(strategy)
    }
  }

  static withBuiltIns() {
    return new StrategyRegistry([
      new LinebreakInsideStrategy(),
      new InlineInsideStrategy(),
      new InsideContainerStrategy(),
      new BeforeNestedStructureStrategy(),
      new AfterBlockStrategy(),
    ])
  }

  register(strategy: InsertionStrategy) {
    const existingIndex = this.strategies.findIndex(candidate => candidate.name === strategy.name)
    if (existingIndex >= 0) {
      this.strategies.splice(existingIndex, 1, strategy)
      return
    }

    this.strategies.push(strategy)
  }

  names(): TranslationInsertion[] {
    return this.strategies.map(strategy => strategy.name)
  }

  get(name: TranslationInsertion): InsertionStrategy | undefined {
    return this.strategies.find(strategy => strategy.name === name)
  }

  resolve(block: TranslationBlock, binding: BlockBinding, mode: PageDisplayMode): InsertionStrategy | undefined {
    const requested = this.get(block.meta.insertion)
    if (requested?.canApply(block, binding, mode)) return requested

    return this.strategies.find(strategy => strategy.canApply(block, binding, mode))
  }
}

export const defaultStrategyRegistry = StrategyRegistry.withBuiltIns()
