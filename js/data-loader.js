/**
 * 数据加载模块
 * 负责从 JSON 文件加载历史开奖数据和 AI 预测数据
 */

const DataLoader = {
    CLOUD_CACHE_KEY: 'dcb-cloud-sync-v1',
    CLOUD_DATA_FILES: [
        'lottery_history.json',
        'ai_predictions.json',
        'predictions_history.json'
    ],
    CLOUD_DATA_SOURCES: [
        {
            label: '上游最新数据',
            repository: 'sinyu1012/Double-Color-Ball-AI',
            branch: 'main'
        },
        {
            label: '本站发布数据',
            base: './data/',
            query: true
        }
    ],

    readCloudCache() {
        try {
            const cached = localStorage.getItem(this.CLOUD_CACHE_KEY);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('读取手机同步缓存失败:', error);
            return null;
        }
    },

    latestLotteryPeriod(lottery) {
        if (!lottery || !Array.isArray(lottery.data)) return 0;
        return lottery.data.reduce(
            (latest, draw) => Math.max(latest, Number(draw.period) || 0),
            0
        );
    },

    latestPredictionPeriod(predictions) {
        if (!predictions) return 0;
        return Number(predictions.target_period) || 0;
    },

    latestHistoryPeriod(history) {
        if (!history || !Array.isArray(history.predictions_history)) return 0;
        return history.predictions_history.reduce(
            (latest, record) =>
                Math.max(latest, Number(record.target_period) || 0),
            0
        );
    },

    preferCached(cached, published, getPeriod) {
        if (!cached) return published;
        if (!published) return cached;
        return getPeriod(cached) >= getPeriod(published) ? cached : published;
    },

    calculateHitResult(prediction, actualResult) {
        const actualReds = new Set(actualResult.red_balls);
        const redHits = prediction.red_balls.filter(ball => actualReds.has(ball));
        const blueHit = prediction.blue_ball === actualResult.blue_ball;
        return {
            red_hits: redHits,
            red_hit_count: redHits.length,
            blue_hit: blueHit,
            total_hits: redHits.length + Number(blueHit)
        };
    },

    ensureCompletedPredictions(history, lottery, ...predictionDocuments) {
        if (
            !history ||
            !Array.isArray(history.predictions_history) ||
            !lottery ||
            !Array.isArray(lottery.data)
        ) {
            return history;
        }

        const records = [...history.predictions_history];
        const knownPeriods = new Set(records.map(record => String(record.target_period)));
        const drawsByPeriod = new Map(
            lottery.data.map(draw => [String(draw.period), draw])
        );

        for (const predictions of predictionDocuments) {
            const period = String(predictions?.target_period || '');
            const actualResult = drawsByPeriod.get(period);
            if (
                !period ||
                !actualResult ||
                knownPeriods.has(period) ||
                !Array.isArray(predictions.models) ||
                predictions.models.length === 0
            ) {
                continue;
            }

            const archivedModels = predictions.models
                .filter(model => Array.isArray(model.predictions) && model.predictions.length > 0)
                .map(model => {
                    const archivedPredictions = model.predictions.map(prediction => ({
                        ...prediction,
                        hit_result: this.calculateHitResult(prediction, actualResult)
                    }));
                    const best = archivedPredictions.reduce(
                        (current, prediction) =>
                            prediction.hit_result.total_hits >
                            current.hit_result.total_hits
                                ? prediction
                                : current
                    );
                    return {
                        ...model,
                        predictions: archivedPredictions,
                        best_group: best.group_id,
                        best_hit_count: best.hit_result.total_hits
                    };
                });

            if (archivedModels.length === 0) continue;

            const record = {
                prediction_date: predictions.prediction_date,
                target_period: period,
                actual_result: actualResult,
                models: archivedModels
            };
            for (const key of ['generated_at', 'generator_version', 'input_fingerprint']) {
                if (predictions[key]) record[key] = predictions[key];
            }

            records.unshift(record);
            knownPeriods.add(period);
        }

        return { ...history, predictions_history: records };
    },

    async fetchJson(url, timeoutMs = 20000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                cache: 'no-store',
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    },

    async loadStaticJson(filename) {
        return this.fetchJson(`./data/${filename}?v=${Date.now()}`);
    },

    async getCloudBase(source) {
        if (source.base) return source.base;

        const fallbackBase =
            `https://cdn.jsdelivr.net/gh/${source.repository}@${source.branch}/data/`;
        try {
            const ref = await this.fetchJson(
                `https://api.github.com/repos/${source.repository}/git/ref/heads/${source.branch}`,
                8000
            );
            if (!ref?.object?.sha) {
                throw new Error('未取得最新版本号');
            }
            return `https://cdn.jsdelivr.net/gh/${source.repository}@${ref.object.sha}/data/`;
        } catch (error) {
            console.warn('获取固定数据版本失败，改用 CDN 分支版本:', error);
            return fallbackBase;
        }
    },

    validateCloudData(lottery, predictions, predictionsHistory) {
        if (!lottery || !Array.isArray(lottery.data) || lottery.data.length === 0) {
            throw new Error('开奖数据格式不正确');
        }
        if (!predictions || !Array.isArray(predictions.models) || predictions.models.length === 0) {
            throw new Error('预测数据格式不正确');
        }
        if (
            !predictionsHistory ||
            !Array.isArray(predictionsHistory.predictions_history)
        ) {
            throw new Error('历史预测数据格式不正确');
        }
    },

    mergeLocalModels(primary, localPredictions) {
        if (
            !localPredictions ||
            localPredictions.target_period !== primary.target_period ||
            !Array.isArray(localPredictions.models)
        ) {
            return primary;
        }

        const modelIds = new Set(primary.models.map(model => model.model_id));
        const extraModels = localPredictions.models.filter(
            model => !modelIds.has(model.model_id)
        );
        return {
            ...primary,
            models: primary.models.concat(extraModels)
        };
    },

    async syncFromCloud() {
        const errors = [];
        const cachedPredictions =
            this.readCloudCache()?.data?.ai_predictions || null;

        for (const source of this.CLOUD_DATA_SOURCES) {
            try {
                const base = await this.getCloudBase(source);
                const query = source.query ? `?t=${Date.now()}` : '';
                const [lottery, upstreamPredictions, predictionsHistory] =
                    await Promise.all(
                        this.CLOUD_DATA_FILES.map(filename =>
                            this.fetchJson(`${base}${filename}${query}`)
                        )
                    );

                let localPredictions = null;
                try {
                    localPredictions = await this.loadStaticJson('ai_predictions.json');
                } catch (error) {
                    console.warn('本站规则模型加载失败，继续使用云端模型:', error);
                }

                const predictions = this.mergeLocalModels(
                    upstreamPredictions,
                    localPredictions
                );
                const completedHistory = this.ensureCompletedPredictions(
                    predictionsHistory,
                    lottery,
                    cachedPredictions,
                    predictions
                );
                this.validateCloudData(lottery, predictions, completedHistory);

                const cache = {
                    savedAt: new Date().toISOString(),
                    source: source.label,
                    latest_period: lottery.data[0].period,
                    latest_date: lottery.data[0].date,
                    target_period: predictions.target_period,
                    data: {
                        lottery_history: lottery,
                        ai_predictions: predictions,
                        predictions_history: completedHistory
                    }
                };

                localStorage.setItem(this.CLOUD_CACHE_KEY, JSON.stringify(cache));
                return {
                    ok: true,
                    source: 'cloud',
                    latest_period: cache.latest_period,
                    latest_date: cache.latest_date,
                    target_period: cache.target_period,
                    models: predictions.models.length,
                    cached_at: cache.savedAt
                };
            } catch (error) {
                errors.push(error.message);
                console.warn('云端数据源同步失败:', source.label, error);
            }
        }

        throw new Error(`公网数据同步失败：${errors.join('；')}`);
    },

    /**
     * 加载历史开奖数据
     * @returns {Promise<Object>} 历史数据对象
     */
    async loadLotteryHistory() {
        try {
            const cache = this.readCloudCache();
            const [published, cached] = await Promise.all([
                this.loadStaticJson('lottery_history.json'),
                Promise.resolve(cache?.data?.lottery_history)
            ]);
            const data = this.preferCached(
                cached,
                published,
                this.latestLotteryPeriod
            );
            console.log('历史开奖数据加载成功', data);
            return data;
        } catch (error) {
            console.error('加载历史开奖数据失败:', error);
            throw error;
        }
    },

    /**
     * 加载 AI 预测数据
     * @returns {Promise<Object>} AI 预测数据对象
     */
    async loadPredictions() {
        try {
            const cache = this.readCloudCache();
            const [published, cached] = await Promise.all([
                this.loadStaticJson('ai_predictions.json'),
                Promise.resolve(cache?.data?.ai_predictions)
            ]);
            const data = this.preferCached(
                cached,
                published,
                this.latestPredictionPeriod
            );
            console.log('AI 预测数据加载成功', data);
            return data;
        } catch (error) {
            console.error('加载 AI 预测数据失败:', error);
            throw error;
        }
    },

    /**
     * 加载历史预测对比数据
     * @returns {Promise<Object>} 历史预测对比数据对象
     */
    async loadPredictionsHistory() {
        try {
            const cache = this.readCloudCache();
            const [published, cached] = await Promise.all([
                this.loadStaticJson('predictions_history.json'),
                Promise.resolve(cache?.data?.predictions_history)
            ]);
            const data = this.preferCached(
                cached,
                published,
                this.latestHistoryPeriod
            );
            console.log('历史预测对比数据加载成功', data);
            return data;
        } catch (error) {
            console.error('加载历史预测对比数据失败:', error);
            throw error;
        }
    },

    /**
     * 加载所有数据
     * @returns {Promise<Object>} 包含历史数据和预测数据的对象
     */
    async loadAllData() {
        try {
            const [lotteryData, predictionData, predictionsHistoryData] = await Promise.all([
                this.loadLotteryHistory(),
                this.loadPredictions(),
                this.loadPredictionsHistory()
            ]);

            return {
                lottery: lotteryData,
                predictions: predictionData,
                predictionsHistory: predictionsHistoryData
            };
        } catch (error) {
            console.error('加载数据失败:', error);
            throw error;
        }
    }
};

// 导出到全局作用域
window.DataLoader = DataLoader;
