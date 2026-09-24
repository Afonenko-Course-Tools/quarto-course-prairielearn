public final class Clamp {
    public static int clamp(int value, int lower, int upper) {
        if (lower > upper) throw new IllegalArgumentException();
        return Math.max(lower, Math.min(value, upper));
    }
}
