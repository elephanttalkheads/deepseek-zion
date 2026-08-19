/**
 * ui-input-trigger vendor 面(zion 直编)。
 * 官方以 cordis Service 装配(service.ts 不在编译面);zion 直用纯类
 * InputTriggerController + MenuView,来源注册表由 zion 适配层提供。
 */
export type {
  ArbitrateKey, ArbitrateOutcome, CandidateRequest, ClientSessionContext, CommandClaim,
  InputTriggerCandidate, InputTriggerPick, InputTriggerSource, InsertReferenceRequest,
  InsertTextRequest, PickOutcome, PickVia, ReferenceCodec, ReferenceInsert, SubmitOutcome,
  TokenSpan, TriggerChar, TriggerGuard, TriggerPosition,
} from '../types.ts'
export { InputTriggerController, type InputTriggerControllerDeps, type SourceRoster } from './controller.ts'
export { MenuView, type MenuViewProps } from './MenuView.tsx'
export type { MenuViewInjected } from './slots.ts'
export type { MenuEvent, MenuState, TriggerHit } from '../core/contract.ts'
export { MENU_CLOSED, exactMatch, menuReduce, seedGroups } from '../core/menu.ts'
export { detectTrigger } from '../core/detect.ts'
