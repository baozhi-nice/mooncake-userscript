export const probabilityTaskFunctionNames = [
    'mooncakeSettleProbabilityTask', 'mooncakeCancelProbabilityTasks',
    'mooncakeScheduleProbabilityTasks', 'mooncakeRunProbabilityTasks',
    'mooncakeWaitForEnhancementRoutePrewarm'
];
export function createProbabilityTaskState() {
    return { queue: new Map(), timer: 0, active: null, generation: 0, sequence: 0, interactiveBatches: 0, cacheEpoch: 0 };
}
