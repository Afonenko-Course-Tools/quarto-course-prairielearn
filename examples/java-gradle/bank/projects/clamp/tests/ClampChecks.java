public final class ClampChecks {
    private static void same(int expected, int actual) {
        if (expected != actual) throw new AssertionError(expected + " != " + actual);
    }
    public static void main(String[] args) {
        same(5, Clamp.clamp(5, 1, 9));
        same(1, Clamp.clamp(-3, 1, 9));
        same(9, Clamp.clamp(20, 1, 9));
        same(-2, Clamp.clamp(-8, -2, -2));
        same(Integer.MAX_VALUE, Clamp.clamp(Integer.MAX_VALUE, Integer.MIN_VALUE, Integer.MAX_VALUE));
        boolean rejected = false;
        try { Clamp.clamp(2, 5, 1); } catch (IllegalArgumentException expected) { rejected = true; }
        if (!rejected) throw new AssertionError("reversed bounds accepted");
        System.out.println("All six Clamp checks passed");
    }
}
