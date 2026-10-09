import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;
final class AddTest {
    @Test void widensFirst() { assertEquals(4294967294L, demo.Add.sum(Integer.MAX_VALUE, Integer.MAX_VALUE)); }
}
