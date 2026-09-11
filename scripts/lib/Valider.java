import javax.xml.XMLConstants;
import javax.xml.transform.stream.StreamSource;
import javax.xml.validation.*;
import java.io.File;

/** Valide un fichier XML contre un XSD. Sortie : OK, ou la première erreur. */
public class Valider {
  public static void main(String[] a) throws Exception {
    SchemaFactory f = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
    Validator v = f.newSchema(new File(a[0])).newValidator();
    try {
      v.validate(new StreamSource(new File(a[1])));
      System.out.println("VALIDE");
    } catch (org.xml.sax.SAXParseException e) {
      System.out.println("INVALIDE ligne " + e.getLineNumber() + " : " + e.getMessage());
      System.exit(1);
    }
  }
}
