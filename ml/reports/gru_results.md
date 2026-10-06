# GRU Forecaster Results

## 1. Loss Curve & Val RMSE
- Train Loss: [143658.97690813823, 142243.471603869, 141051.00059444396, 139919.84843561714]
- Val Loss: [143215.14806682288, 141978.884114415, 140821.4045572075, 139711.47324256625]
- Val RMSE per channel: [8.702949523925781, 0.38082441687583923, 0.4361048638820648, 53.11751174926758, 4.902413845062256, 6.338857650756836, 2.7835891246795654, 1.4586058855056763, 0.020680779591202736, 0.02077857404947281, 0.0579577274620533, 0.060033731162548065, 0.053351908922195435, 0.040765177458524704, 1783.0723876953125, 55.11764907836914, 0.5481114983558655, 0.062137361615896225, 31.1137752532959, 26.826623916625977, 0.5799077749252319, 36.534000396728516, 158.0640411376953]

## 2. Conformal Thresholds
- Thresholds (alpha=0.01): [8.998003005981445, 0.7622706890106201, 0.7732456922531128, 60.85818862915039, 7.429513931274414, 9.287895202636719, 4.680737495422363, 2.4677746295928955, 0.05049804598093033, 0.04975796118378639, 0.10066860169172287, 0.11615875363349915, 0.10673566907644272, 0.08760128915309906, 2069.190185546875, 57.97941207885742, 1.175711989402771, 0.15757711231708527, 41.22187423706055, 34.520973205566406, 1.3515836000442505, 45.743160247802734, 212.03448486328125]

## 3. False Alert Rates
- Z-score baseline: 0.006206 per row (536.2/day)
- GRU + Conformal: 0.199483 per row (17235.3/day)
- GRU + Conformal + Persist: 0.171235 per row (14794.7/day)

## 4. Fault Detection (No mask)
**Detected:** 8/8

| Fault | Detected | Delay (rows) | Top 3 Channels (by residual share) |
|---|---|---|---|
| 1 | Yes | 15 | power_bus_voltage_V, comm_rx_dbm, memory_utilization_pct |
| 2 | Yes | 3 | solar_array_current_A, radiation_rate_counts_s, reaction_wheel_speed_rpm |
| 3 | Yes | 3 | gyro_y_deg_s, gyro_z_deg_s, reaction_wheel_speed_rpm |
| 4 | Yes | 2 | battery_soc_pct, power_bus_voltage_V, eps_temperature_C |
| 5 | Yes | 7 | packet_loss_pct, radiation_rate_counts_s, comm_rx_dbm |
| 6 | Yes | 6 | radiation_rate_counts_s, comm_rx_dbm, power_bus_voltage_V |
| 7 | Yes | 2 | imu_accel_x_mps2, imu_accel_y_mps2, battery_soc_pct |
| 8 | Yes | 3 | imu_accel_z_mps2, power_bus_current_A, power_bus_voltage_V |

## 5. Fault Detection (20% mask)
**Detected:** 8/8

| Fault | Detected | Delay (rows) | Top 3 Channels |
|---|---|---|---|
| 1 | Yes | 15 | power_bus_voltage_V, comm_rx_dbm, memory_utilization_pct |
| 2 | Yes | 3 | solar_array_current_A, radiation_rate_counts_s, reaction_wheel_speed_rpm |
| 3 | Yes | 3 | gyro_y_deg_s, gyro_z_deg_s, reaction_wheel_speed_rpm |
| 4 | Yes | 2 | battery_soc_pct, power_bus_voltage_V, eps_temperature_C |
| 5 | Yes | 7 | packet_loss_pct, radiation_rate_counts_s, comm_rx_dbm |
| 6 | Yes | 6 | radiation_rate_counts_s, comm_rx_dbm, power_bus_voltage_V |
| 7 | Yes | 2 | imu_accel_x_mps2, imu_accel_y_mps2, battery_soc_pct |
| 8 | Yes | 3 | imu_accel_z_mps2, power_bus_current_A, power_bus_voltage_V |
