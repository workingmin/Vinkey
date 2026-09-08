pub fn fitted_group(sidebar_width: f64, native_width: f64, native_left: f64) -> (f64, f64) {
    let scale = ((sidebar_width - 12.0) / native_width).clamp(0.0, 1.0);
    let left = native_left.min((sidebar_width - native_width * scale) / 2.0);
    (left, scale)
}

#[cfg(test)]
mod tests {
    use super::fitted_group;

    #[test]
    fn collapsed_controls_fit_with_equal_margins() {
        let (left, scale) = fitted_group(52.0, 54.0, 12.0);
        assert_eq!(left, 6.0);
        assert!((left + 54.0 * scale - 46.0).abs() < 1e-9);
        assert!(14.0 * scale >= 10.0);
    }

    #[test]
    fn expanded_controls_keep_the_native_size_and_inset() {
        for width in [232.0, 248.0, 288.0] {
            assert_eq!(fitted_group(width, 54.0, 12.0), (12.0, 1.0));
        }
    }

    #[test]
    fn animation_widths_fit_without_enlarging_native_controls() {
        let mut previous_scale = 0.0;
        for width in 52..=288 {
            let (left, scale) = fitted_group(width as f64, 54.0, 12.0);
            assert!(scale >= previous_scale && scale <= 1.0);
            assert!(left >= 6.0 && left + 54.0 * scale <= width as f64 - 6.0);
            previous_scale = scale;
        }
    }

    #[test]
    fn larger_system_buttons_also_fit_the_collapsed_sidebar() {
        let (left, scale) = fitted_group(52.0, 66.0, 12.0);
        assert_eq!(left, 6.0);
        assert_eq!(left + 66.0 * scale, 46.0);
    }
}
