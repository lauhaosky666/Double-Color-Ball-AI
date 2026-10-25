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
        'https://raw.githubusercontent.com/sinyu1012/Double-Color-Ball-AI/main/data/',
        'https://raw.githubusercontent.com/lauhaosky666/Double-Color-Ball-AI/main/data/'
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

    async fetchJson(url) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    },

    async loadStaticJson(filename) {
        return this.fetchJson(`./data/${filename}?v=${Date.now()}`);
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

        for (const source of this.CLOUD_DATA_SOURCES) {
            try {
                const [lottery, upstreamPredictions, predictionsHistory] =
                    await Promise.all(
                        this.CLOUD_DATA_FILES.map(filename =>
                            this.fetchJson(`${source}${filename}?t=${Date.now()}`)
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
                this.validateCloudData(lottery, predictions, predictionsHistory);

                const cache = {
                    savedAt: new Date().toISOString(),
                    source,
                    latest_period: lottery.data[0].period,
                    latest_date: lottery.data[0].date,
                    target_period: predictions.target_period,
                    data: {
                        lottery_history: lottery,
                        ai_predictions: predictions,
                        predictions_history: predictionsHistory
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
                console.warn('云端数据源同步失败:', source, error);
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
            const data = cache?.data?.lottery_history ||
                await this.loadStaticJson('lottery_history.json');
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
            const data = cache?.data?.ai_predictions ||
                await this.loadStaticJson('ai_predictions.json');
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
            const data = cache?.data?.predictions_history ||
                await this.loadStaticJson('predictions_history.json');
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
