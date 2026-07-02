import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import './Analytics.css'

const API_URL = '/api/v1/analytics'
const DEFAULT_DAYS = 30

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [analytics, setAnalytics] = useState(null)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${API_URL}?days=${DEFAULT_DAYS}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      setAnalytics(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="analytics-page">
        <h1 className="analytics-title">Analytics</h1>
        <div className="analytics-error">{error}</div>
      </div>
    )
  }

  const data = analytics?.data || []
  const summary = analytics?.summary || { totalDays: 0, totalVisitors: 0, totalRequests: 0, averageVisitorsPerDay: 0 }
  const topUrls = analytics?.topUrls || []

  const chartColors = {
    grid: '#252a31',
    axis: '#869489',
    tooltipBg: '#171c22',
    tooltipBorder: '#252a31',
    text: '#dee3eb',
    muted: '#869489',
    visitors: '#59de9b',
    requests: '#e1c299',
    success: '#ffc658',
  }

  return (
    <div className="analytics-page">
      <h1 className="analytics-title">play361 Analytics</h1>
      <p className="analytics-subtitle">{`최근 ${DEFAULT_DAYS}일 방문자 통계`}</p>

      <div className="analytics-summary">
        <div className="stat-card">
          <span className="stat-label">기간</span>
          <span className="stat-value">{`${summary.totalDays}일`}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">총 방문자</span>
          <span className="stat-value">{summary.totalVisitors.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">총 요청</span>
          <span className="stat-value">{summary.totalRequests.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">일평균 방문자</span>
          <span className="stat-value">{summary.averageVisitorsPerDay.toLocaleString()}</span>
        </div>
      </div>

      <div className="analytics-section">
        <h2 className="section-title">일별 사용자 수</h2>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" stroke={chartColors.axis} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartColors.axis} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.text }}
                labelStyle={{ color: chartColors.muted }}
              />
              <Legend />
              <Line type="monotone" dataKey="visitors" stroke={chartColors.visitors} activeDot={{ r: 8 }} name="고유 사용자 수" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="analytics-empty">수집된 방문자 데이터가 없습니다.</div>
        )}
      </div>

      <div className="analytics-section">
        <h2 className="section-title">일별 요청 수</h2>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" stroke={chartColors.axis} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartColors.axis} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.text }}
                labelStyle={{ color: chartColors.muted }}
              />
              <Legend />
              <Line type="monotone" dataKey="totalRequests" stroke={chartColors.requests} activeDot={{ r: 8 }} name="전체 요청 수" strokeWidth={2} />
              <Line type="monotone" dataKey="successfulRequests" stroke={chartColors.success} name="성공 요청 수" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="analytics-empty">수집된 요청 데이터가 없습니다.</div>
        )}
      </div>

      <div className="analytics-section">
        <h2 className="section-title">자주 요청된 URL Top 50</h2>
        {topUrls.length > 0 ? (
          <div className="url-table-wrapper">
            <table className="url-table">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>URL</th>
                  <th>요청 수</th>
                </tr>
              </thead>
              <tbody>
                {topUrls.map((item, idx) => (
                  <tr key={item.url}>
                    <td>{idx + 1}</td>
                    <td className="url-cell">{item.url}</td>
                    <td className="count-cell">{item.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytics-empty">수집된 URL 데이터가 없습니다.</div>
        )}
      </div>

      <p className="analytics-timestamp">
        {`Last updated: ${analytics?.timestamp ? new Date(analytics.timestamp).toLocaleString() : 'N/A'}`}
      </p>
    </div>
  )
}
