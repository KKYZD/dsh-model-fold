/**
 * dsh-model-fold — browser half.
 *
 * Replaces the composer's `conversation.input.model` seat with a variant of
 * the stock ModelSelect that mirrors ZCode's composer model picker:
 *
 * - Clicking the trigger opens a provider menu that grows UPWARD from the
 *   trigger (bottom-right anchored), because the trigger sits at the bottom
 *   of the window — a downward menu clips against the viewport edge.
 * - The menu lists PROVIDERS; hovering, clicking, or pressing ArrowRight on
 *   one opens a floating model submenu anchored beside the menu. The submenu
 *   scrolls internally (max ~296px), so a long catalog stays fully reachable.
 * - The provider holding the current model carries a check mark, and the
 *   current model is checked inside its submenu — "where am I" is always
 *   visible without opening anything.
 * - Reasoning effort is selectable again: a menu row under the providers
 *   (label + current level + chevron) opens a levels submenu for the current
 *   model; choosing one re-submits the current provider/model with the new
 *   `reasoningEffort`, exactly like the stock seat's effort pane. The trigger
 *   shows `model · effort` in the stock layout.
 * - Selection still goes through `directory.select(...)` on the SAME shared
 *   `ModelDirectory` instance the stock seat uses, so reasoning-effort
 *   defaults, the pending spinner, and failure handling are unchanged, and
 *   the stock `/model` popup stays in sync with what is picked here.
 * - `conversation.input.model` is a `single` slot, which the registry models
 *   as a priority election over one cell (`entriesOfSlot`, ascending
 *   priority, first live entry wins). The stock seat registers at the default
 *   priority 0, so registering at `priority: -1` shadows it without touching
 *   DSH source and without a duplicate-registration error. Removing this
 *   plugin restores the stock seat automatically.
 */
window.__ModuleLoader__.load({
	id: 'dsh-model-fold',
	factory: (require) => {
		var module = { exports: {} }
		var exports = module.exports
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

		const react = require('react')
		const jsxRuntime = require('react/jsx-runtime')
		const jsx = jsxRuntime.jsx
		const jsxs = jsxRuntime.jsxs
		const Fragment = react.Fragment

		//#region styles
		/** Injected once; classes are namespaced to avoid clashing with the shell. */
		const STYLE_ID = 'dsh-model-fold/ModelFold.css'
		/**
		 * Typography mirrors ZCode's picker: 14px UI text on 32px rows, system
		 * sans stack, 14px stroke chevrons in the caption tone.
		 */
		const CSS = `
.mf-root{min-width:0;position:relative}
.mf-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:14px;font-weight:400;line-height:20px;display:flex}
.mf-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mf-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.mf-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.mf-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.mf-triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden}
.mf-chevron{color:var(--dsw-alias-label-caption);flex:none;display:inline-flex}
.mf-menu,.mf-sub{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:0;padding:4px;display:flex;flex-direction:column;position:fixed;font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}
.mf-menu{width:max-content;min-width:200px;max-width:min(420px,100vw - 32px);overflow:hidden}
.mf-sub{width:max-content;min-width:192px;max-height:296px;overflow-y:auto;overscroll-behavior:contain}
.mf-item,.mf-row{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;text-align:left;background:0 0;border:none;cursor:pointer;padding:4px 8px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-primary);font-size:14px;line-height:20px;font-weight:400}
.mf-item:hover,.mf-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mf-item:focus-visible,.mf-row:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.mf-row:disabled{cursor:default;color:var(--dsw-alias-label-dimmed)}
.mf-itemName,.mf-rowCopy{flex:1;min-width:0;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;text-align:left}
.mf-check{flex:none;color:var(--dsw-alias-label-caption);font-size:14px;width:16px;text-align:center;line-height:20px}
.mf-value{flex:none;color:var(--dsw-alias-label-caption);font-size:12px;line-height:20px;max-width:140px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.mf-sep{flex:none;height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}
.mf-caret{flex:none;color:var(--dsw-alias-label-caption);display:inline-flex}
.mf-status,.mf-empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
.mf-error{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);padding:6px 8px;font-size:12px;line-height:18px;display:flex;gap:8px;align-items:center;justify-content:space-between}
.mf-retry{background:0 0;border:none;cursor:pointer;color:inherit;text-decoration:underline;font-size:12px}
`
		/** 14px stroke chevron, the icon shape ZCode's menus use. */
		const chevron = (direction) =>
			jsx('svg', {
				className: 'mf-caret',
				width: 14,
				height: 14,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 2,
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round',
				'aria-hidden': 'true',
				children: jsx('path', { d: direction === 'down' ? 'M6 9l6 6 6-6' : 'M9 18l6-6-6-6' }),
			})
		function ensureStyle() {
			if (typeof document === 'undefined') return
			if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
			const tag = document.createElement('style')
			tag.dataset.pluginCss = STYLE_ID
			tag.textContent = CSS
			document.head.appendChild(tag)
		}
		//#endregion

		//#region helpers
		/**
		 * Provider ordering, mirroring the stock entry: DeepSeek Account first,
		 * DeepSeek second, third-party providers in catalog order.
		 * @param groups - provider groups from the directory snapshot.
		 * @returns a new, ordered array.
		 */
		function orderProviders(groups) {
			const rank = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2)
			return [...groups].sort((left, right) => rank(left.id) - rank(right.id))
		}
		//#endregion

		//#region component
		/**
		 * The ZCode-style model selector.
		 * @param props - the seat's injected props plus the slot's own props.
		 * @returns the trigger, and the provider menu + model submenu while open.
		 */
		function ModelFold(props) {
			const { locked, available, directory, load, select, t } = props
			const state = react.useSyncExternalStore(
				(callback) => directory.subscribe(callback),
				() => directory.getSnapshot(),
			)

			const [open, setOpen] = react.useState(false)
			/** Sentinel panel id: the reasoning-effort submenu (keyed differently from providers). */
			const EFFORT_PANEL = '__effort__'
			/**
			 * Viewport anchor for the open menu, measured from the trigger: the
			 * trigger sits at the composer's bottom-right, so the menu must grow
			 * UPWARD (bottom- and right-anchored) and cap its height at the space
			 * above — a statically-placed fixed menu grows down past the viewport
			 * edge, where its scrollable area is clipped and unreachable.
			 */
			const [menuAnchor, setMenuAnchor] = react.useState(null)
			/** Provider whose model submenu is open; null = the menu level. */
			const [activeProvider, setActiveProvider] = react.useState(null)
			/** Viewport anchor for the open submenu panel. */
			const [subAnchor, setSubAnchor] = react.useState(null)

			const rootRef = react.useRef(null)
			const triggerRef = react.useRef(null)
			const menuRef = react.useRef(null)
			/** Set when a submenu was opened from the keyboard, so the first model row takes focus. */
			const focusSubRef = react.useRef(false)
			/**
			 * Live DOM nodes per row key, plus the element->key mapping the arrow
			 * handler needs to find where focus currently is. Both are rebuilt on
			 * every render from the ref callbacks below, because switching panels
			 * unmounts the other panel's rows and would otherwise leave stale targets.
			 */
			const rowNodes = react.useRef(null)
			const rowKeys = react.useRef(null)
			if (rowNodes.current === null) rowNodes.current = new Map()
			if (rowKeys.current === null) rowKeys.current = new Map()
			const nodesNow = new Map()
			const keysNow = new Map()
			/**
			 * Build a ref callback that records one row's node under its key.
			 * @param rowKey - stable identity of the row within one render.
			 * @returns the ref callback to hand to the element.
			 */
			const rowRef = (rowKey) => (element) => {
				if (element === null) return
				nodesNow.set(rowKey, element)
				keysNow.set(element, rowKey)
			}
			// Publish this render's maps so the keyboard handler reads current nodes.
			rowNodes.current = nodesNow
			rowKeys.current = keysNow

			const groups = react.useMemo(
				() => orderProviders(state.groups).filter((group) => group.models.length > 0),
				[state.groups],
			)

			/** The provider owning the current selection. */
			const currentProvider = state.current?.provider ?? null

			const currentModel = react.useMemo(() => {
				if (state.current === null) return null
				for (const group of groups) {
					if (group.id !== state.current.provider) continue
					return group.models.find((model) => model.id === state.current.model) ?? null
				}
				return null
			}, [groups, state.current])
			const currentModelName = currentModel === null ? null : currentModel.name

			const busy = state.pending !== null
			const modelLabel =
				state.current === null
					? state.status === 'loading'
						? t('trigger.loading')
						: t('trigger.fallback')
					: currentModelName ?? `${state.current.provider}/${state.current.model}`

			/**
			 * Reasoning-effort state, mirroring the stock seat: the current model's
			 * `reasoning` metadata carries the supported levels (`efforts`, with
			 * display names) plus its `defaultEffort`; the effective effort is the
			 * user's choice (`state.current.reasoningEffort`) or that default.
			 * Models without reasoning metadata fall back to the retained effort.
			 */
			const reasoning = currentModel === null ? undefined : currentModel.reasoning
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
			const effortLabel =
				reasoning === undefined
					? state.retainedEffort
					: effectiveEffort === undefined
						? t('effort.providerDefault')
						: (reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort)
			const effortChoices = react.useMemo(
				() =>
					reasoning === undefined
						? []
						: [
								...(reasoning.defaultEffort === undefined
									? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
									: []),
								...reasoning.efforts.map((level) => ({
									key: `effort:${level.id}`,
									effort: level.id,
									label: level.name,
								})),
							],
				[reasoning, t],
			)

			react.useEffect(() => {
				if (!open) return undefined
				load()
				return undefined
			}, [open, load])

			/** A closed picker must reopen at the menu level, not inside a submenu. */
			react.useEffect(() => {
				if (!open) {
					setActiveProvider(null)
					setSubAnchor(null)
				}
			}, [open])

			/**
			 * Measure the anchor before the open menu first paints
			 * (layout effect: no flicker), clamping the height to the room above
			 * the trigger. The menu renders only once the anchor exists.
			 */
			react.useLayoutEffect(() => {
				if (!open) {
					setMenuAnchor(null)
					return
				}
				const rect = triggerRef.current?.getBoundingClientRect()
				if (rect === undefined || rect === null) return
				const gap = 6
				setMenuAnchor({
					right: Math.max(8, window.innerWidth - rect.right),
					bottom: window.innerHeight - rect.top + gap,
					maxHeight: Math.max(160, Math.min(460, rect.top - gap - 12)),
				})
			}, [open])

				/** Keyboard-initiated submenu opens move focus to the first row. */
				react.useEffect(() => {
					if (activeProvider === null || !focusSubRef.current) return
					focusSubRef.current = false
					const firstKey =
						activeProvider === EFFORT_PANEL
							? (effortChoices[0] !== undefined ? `e:${effortChoices[0].key}` : null)
							: (() => {
									const active = groups.find((group) => group.id === activeProvider)
									const first = active?.models[0]
									return first !== undefined ? `m:${activeProvider}/${first.id}` : null
								})()
					if (firstKey !== null) rowNodes.current.get(firstKey)?.focus()
				}, [activeProvider, groups, effortChoices])

			react.useEffect(() => {
				if (!open) return undefined
				const onPointerDown = (event) => {
					if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
				}
				document.addEventListener('mousedown', onPointerDown)
				return () => {
					document.removeEventListener('mousedown', onPointerDown)
				}
			}, [open])

			/**
			 * Compute the floating-panel anchor beside the menu, mirroring
			 * ZCode/Radix submenu placement. Horizontally: prefer the menu's RIGHT
			 * side, flip LEFT when the right side cannot fit the minimum panel
			 * width (this picker hugs the window's right edge, so left is the usual
			 * landing spot). Vertically: the panel's FIRST row lines up with the
			 * hovered provider row (panel padding compensated); when the panel
			 * would overflow the viewport bottom it shifts UP just enough to fit,
			 * and a panel taller than the viewport pins to the top and scrolls.
			 * @param rowEl - the hovered row's DOM node, for vertical alignment.
			 * @param itemCount - rows the panel will render (fixed 32px heights).
			 * @returns the anchor, or null while the menu is not measurable.
			 */
			const anchorSub = (rowEl, itemCount) => {
				const menuRect = menuRef.current?.getBoundingClientRect()
				if (menuRect === undefined || menuRect === null) return null
				const rowRect = rowEl?.getBoundingClientRect?.() ?? menuRect
				const contentHeight = Math.min(itemCount * 32 + 8, 296)
				const ideal = rowRect.top - 4
				const bottomLimit = window.innerHeight - 12
				const top = Math.max(12, Math.min(ideal, bottomLimit - contentHeight))
				const gap = 4
				const roomRight = window.innerWidth - menuRect.right - gap - 8
				const roomLeft = menuRect.left - gap - 8
				const side = roomRight >= 192 ? 'right' : 'left'
				return {
					side,
					top,
					maxHeight: Math.min(296, window.innerHeight - 24),
					maxWidth: Math.max(160, Math.min(360, side === 'right' ? roomRight : roomLeft)),
					...(side === 'right'
						? { left: menuRect.right + gap }
						: { right: Math.max(8, window.innerWidth - menuRect.left + gap) }),
				}
			}

			/**
			 * Open one provider's model submenu beside the menu.
			 * @param group - the provider to expand.
			 * @param rowEl - the provider row's DOM node.
			 */
			const openSub = (group, rowEl) => {
				const anchor = anchorSub(rowEl, group.models.length)
				if (anchor === null) return
				setSubAnchor(anchor)
				setActiveProvider(group.id)
			}

			/** Open the reasoning-effort submenu for the current model. */
			const openEffort = (rowEl) => {
				const anchor = anchorSub(rowEl, effortChoices.length)
				if (anchor === null) return
				setSubAnchor(anchor)
				setActiveProvider(EFFORT_PANEL)
			}

			/** Collapse the submenu back to the provider level. */
			const closeSub = () => {
				setActiveProvider(null)
				setSubAnchor(null)
			}

			/**
			 * Arrow-key traversal across the two panels. Up/down walk the ACTIVE
			 * panel's rows; Right opens the focused provider's submenu (keyboard
			 * opens focus the first model row); Left/Escape collapse the submenu
			 * back to its provider row; Escape at the menu level closes everything
			 * and hands focus back to the trigger.
			 * @param event - the keydown event on either panel.
			 */
			const onMenuKeyDown = (event) => {
				const key = event.key

				if (key === 'Escape') {
					event.stopPropagation()
					event.preventDefault()
					if (activeProvider !== null) {
						const providerKey = `g:${activeProvider}`
						closeSub()
						rowNodes.current.get(providerKey)?.focus()
					} else {
						setOpen(false)
						triggerRef.current?.focus()
					}
					return
				}

				if (key === 'ArrowRight' || key === 'ArrowLeft') {
					if (key === 'ArrowRight' && activeProvider === null) {
						const focusedKey = rowKeys.current.get(document.activeElement)
						if (focusedKey === `g:${EFFORT_PANEL}`) {
							event.preventDefault()
							focusSubRef.current = true
							openEffort(rowNodes.current.get(focusedKey))
							return
						}
						const group = groups.find((candidate) => `g:${candidate.id}` === focusedKey)
						if (group === undefined) return
						event.preventDefault()
						focusSubRef.current = true
						openSub(group, rowNodes.current.get(focusedKey))
					} else if (key === 'ArrowLeft' && activeProvider !== null) {
						event.preventDefault()
						const providerKey = `g:${activeProvider}`
						closeSub()
						rowNodes.current.get(providerKey)?.focus()
					}
					return
				}

				if (key !== 'ArrowDown' && key !== 'ArrowUp') return

				// The rows a user can actually reach, in visual order, in the panel
				// focus currently lives in.
				const rows = []
				if (activeProvider === EFFORT_PANEL) {
					for (const level of effortChoices) rows.push({ key: `e:${level.key}` })
				} else if (activeProvider !== null) {
					const active = groups.find((group) => group.id === activeProvider)
					for (const model of active?.models ?? []) {
						rows.push({ key: `m:${activeProvider}/${model.id}` })
					}
				} else {
					for (const group of groups) rows.push({ key: `g:${group.id}` })
					if (effortChoices.length > 0) rows.push({ key: `g:${EFFORT_PANEL}` })
				}
				if (rows.length === 0) return

				const focusedKey = rowKeys.current.get(document.activeElement)
				let at = -1
				for (let i = 0; i < rows.length; i += 1) {
					if (rows[i].key === focusedKey) {
						at = i
						break
					}
				}

				event.preventDefault()
				const step = key === 'ArrowDown' ? 1 : -1
				const nextIndex = at === -1 ? 0 : (at + step + rows.length) % rows.length
				rowNodes.current.get(rows[nextIndex].key)?.focus()
			}

			const choose = (group, model) => {
				if (busy || !available) return
				const reasoningEffort = model.reasoning?.defaultEffort
				select({
					provider: group.id,
					model: model.id,
					...(reasoningEffort === undefined ? {} : { reasoningEffort }),
				})
				setOpen(false)
				setActiveProvider(null)
				setSubAnchor(null)
			}

			/**
			 * Reasoning-effort choice, mirroring the stock seat: re-submit the
			 * current provider/model with the new effort; picking the already
			 * effective level just closes.
			 * @param effort - the chosen level id, or undefined for provider default.
			 */
			const chooseEffort = (effort) => {
				if (busy || !available || state.current === null) return
				setOpen(false)
				setActiveProvider(null)
				setSubAnchor(null)
				if (effectiveEffort === effort) return
				select({
					provider: state.current.provider,
					model: state.current.model,
					...(effort === undefined ? {} : { reasoningEffort: effort }),
				})
			}

			const active = activeProvider === null ? null : groups.find((group) => group.id === activeProvider) ?? null

			return jsxs(Fragment, {
				children: [
					jsxs('div', {
						className: 'mf-root',
						ref: rootRef,
						children: [
							jsxs('button', {
								type: 'button',
								ref: triggerRef,
								className: 'mf-trigger',
								disabled: locked,
								'aria-expanded': open,
								'aria-haspopup': 'menu',
								onClick: () => setOpen((value) => !value),
								children: [
									jsx('span', { className: 'mf-triggerLabel', children: modelLabel }),
									effortLabel !== undefined && effortLabel !== null
										? jsx('span', { className: 'mf-triggerEffort', children: ` \u00B7 ${effortLabel}` })
										: null,
									jsx('span', { className: 'mf-chevron', 'aria-hidden': 'true', children: chevron('down') }),
								],
							}),
							open && menuAnchor !== null
								? jsxs(
										'div',
										{
											className: 'mf-menu',
											role: 'menu',
											ref: menuRef,
											'aria-label': t('menu.model'),
											style: {
												right: menuAnchor.right,
												bottom: menuAnchor.bottom,
												maxHeight: menuAnchor.maxHeight,
											},
											onKeyDown: onMenuKeyDown,
											children: [
												state.status === 'error' && state.error !== null
													? jsxs(
															'div',
															{
																className: 'mf-error',
																key: 'error',
																children: [
																	jsx('span', { children: t('error.action', { message: state.error }) }),
																	jsx('button', {
																		type: 'button',
																		className: 'mf-retry',
																		onClick: () => {
																			load()
																		},
																		children: t('action.reload'),
																	}),
																],
															},
															'error',
														)
													: null,
												groups.map((group) =>
													jsxs(
														'button',
														{
															type: 'button',
															role: 'menuitem',
															ref: rowRef(`g:${group.id}`),
															className: 'mf-item',
															'aria-haspopup': 'menu',
															'aria-expanded': activeProvider === group.id,
															onPointerEnter: (event) => openSub(group, event.currentTarget),
															onClick: (event) => openSub(group, event.currentTarget),
															children: [
																jsx('span', {
																	className: 'mf-itemName',
																	children:
																		group.id === 'deepseek-account' ? t('provider.account') : group.name,
																}),
																currentProvider === group.id
																	? jsx('span', { className: 'mf-check', children: '\u2713' })
																	: null,
																chevron('right'),
															],
														},
														group.id,
													),
												),
												effortChoices.length > 0
													? jsxs(
															Fragment,
															{
																children: [
																	jsx('div', { className: 'mf-sep', 'aria-hidden': 'true' }),
																	jsxs(
																		'button',
																		{
																			type: 'button',
																			role: 'menuitem',
																			ref: rowRef(`g:${EFFORT_PANEL}`),
																			className: 'mf-item',
																			'aria-haspopup': 'menu',
																			'aria-expanded': activeProvider === EFFORT_PANEL,
																			onPointerEnter: (event) => openEffort(event.currentTarget),
																			onClick: (event) => openEffort(event.currentTarget),
																			children: [
																				jsx('span', {
																					className: 'mf-itemName',
																					children: t('menu.effort'),
																				}),
																				effortLabel !== undefined && effortLabel !== null
																					? jsx('span', { className: 'mf-value', children: effortLabel })
																					: null,
																				chevron('right'),
																			],
																		},
																		EFFORT_PANEL,
																	),
																],
															},
															'effort-row',
														)
													: null,
												state.status === 'ready' && groups.length === 0
													? jsx(
															'div',
															{
																className: 'mf-empty',
																role: 'status',
																key: 'empty',
																children: t('empty.models'),
															},
															'empty',
														)
													: null,
											],
										},
										'menu',
									)
								: null,
							open && active !== null && subAnchor !== null
								? jsx(
										'div',
										{
											className: 'mf-sub',
											role: 'menu',
											'aria-label': active.id === 'deepseek-account' ? t('provider.account') : active.name,
											style: {
												top: subAnchor.top,
												maxHeight: subAnchor.maxHeight,
												maxWidth: subAnchor.maxWidth,
												...(subAnchor.side === 'right'
													? { left: subAnchor.left }
													: { right: subAnchor.right }),
											},
											onKeyDown: onMenuKeyDown,
											children: active.models.map((model) =>
												jsxs(
													'button',
													{
														type: 'button',
														role: 'menuitemradio',
														ref: rowRef(`m:${active.id}/${model.id}`),
														'aria-checked':
															state.current?.provider === active.id && state.current.model === model.id,
														className: 'mf-row',
														title: model.name,
														disabled: busy,
														onClick: () => choose(active, model),
														children: [
															jsx('span', { className: 'mf-rowCopy', children: model.name }),
															jsx('span', {
																className: 'mf-check',
																children:
																	state.current?.provider === active.id && state.current.model === model.id
																		? '\u2713'
																		: '',
															}),
														],
													},
													model.id,
												),
											),
										},
										'sub',
									)
								: null,
							open && activeProvider === EFFORT_PANEL && subAnchor !== null
								? jsx(
										'div',
										{
											className: 'mf-sub',
											role: 'menu',
											'aria-label': t('menu.effort'),
											style: {
												top: subAnchor.top,
												maxHeight: subAnchor.maxHeight,
												maxWidth: subAnchor.maxWidth,
												...(subAnchor.side === 'right'
													? { left: subAnchor.left }
													: { right: subAnchor.right }),
											},
											onKeyDown: onMenuKeyDown,
											children:
												effortChoices.length === 0
													? jsx('div', { className: 'mf-empty', children: t('empty.efforts') })
													: effortChoices.map((level) =>
															jsxs(
																'button',
																{
																	type: 'button',
																	role: 'menuitemradio',
																	ref: rowRef(`e:${level.key}`),
																	'aria-checked': effectiveEffort === level.effort,
																	className: 'mf-row',
																	disabled: busy,
																	onClick: () => chooseEffort(level.effort),
																	children: [
																		jsx('span', { className: 'mf-rowCopy', children: level.label }),
																		jsx('span', {
																			className: 'mf-check',
																			children: effectiveEffort === level.effort ? '\u2713' : '',
																		}),
																	],
																},
																level.key,
															),
														),
										},
										'effort-sub',
									)
								: null,
						],
					}),
				],
			})
		}
		//#endregion

		//#region plugin
		/**
		 * Fiber inject declaration. This list is an authorization gate, not a
		 * wait list: the seat inject runs at render time, outside any
		 * `ctx.inject` scope, and service proxies bind `this` to the CALLING
		 * plugin's fiber — so when `models.directoryFor(sessionId)` internally
		 * reaches `this.ctx.remote.session`, the access is authorized against
		 * THIS list. Without `remote` / `remote.session` the model directory
		 * proxy throws `cannot get property "remote.session" without inject`,
		 * the seat crashes on first render, and the election abdicates back to
		 * the stock selector. The stock ModelSelect declares the same pair.
		 * `modelDirectories` needs no entry here: apply reads it only inside
		 * `ctx.inject`, whose dependency list authorizes it directly.
		 */
		const inject = ['slots', 'sessions', 'remote', 'remote.session']

		/**
		 * Client plugin body: register the ZCode-style selector over the same
		 * `conversation.input.model` seat the stock plugin uses. The `single`
		 * slot elects by lowest priority, so registering at -1 shadows the
		 * stock seat instead of colliding with it.
		 * @param ctx - the client root context.
		 */
		function apply(ctx) {
			ensureStyle()
			ctx.inject(['slots', 'modelDirectories', 'sessions'], (scope) => {
				const models = scope.modelDirectories
				const sessions = scope.sessions
				scope.slots.inject('conversation.input.model', () =>
					scope.slots.register(
						{
							name: 'conversation.input.model',
							locale: 'model',
							/**
							 * Negative priority shadows the stock seat, which registers at
							 * the default 0. The `single` slot elects one cell by lowest
							 * priority, so the stock registration stays on the ledger and
							 * simply loses the election while this plugin is mounted.
							 */
							priority: -1,
							inject: (sessionId) => {
								const directory = models.directoryFor(sessionId)
								const available = sessions.subagentAddress(sessionId) === undefined
								return {
									available,
									directory: directory.store,
									load: () => {
										if (available) directory.load().catch(() => {})
									},
									select: (selection) =>
										available ? directory.select(selection) : Promise.resolve(undefined),
								}
							},
						},
						ModelFold,
					),
				)
			})
		}
		//#endregion

		exports.apply = apply
		exports.inject = inject
		return module.exports
	},
})
